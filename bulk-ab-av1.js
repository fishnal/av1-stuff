const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * @param {string} s
 */
function kebabCaseToCamelCase(s) {
	let parts = s.split('-').filter(p => p.length);
	parts = [ parts[0], ...parts.slice(1).map(p => p[0].toUpperCase() + p.substring(1)) ];
	return parts.join('');
}

/**
 * @typedef {{
 *   name: string;
 *   alias?: string;
 *   isBoolean?: boolean;
 *   required?: boolean;
 *   dependencies?: string[];
 *   description: string;
 * }[]} ProgramOptsDefns
 */

/**
 * @param {ProgramOptsDefns} programOptDefns
 */
function printHelp(programOptDefns) {
	let help = `Usage: node bulk-ab-av1.js [options] <ab-av1 command> [ab-av1 options]\n`;

	for (let optDefn of programOptDefns) {
		help += '    ';
		help += optDefn.required ? '<' : '[';

		if (optDefn.alias) {
			help += `-${optDefn.alias},`;
		}
		help += `--${optDefn.name}`;

		help += optDefn.required ? '>' : ']';

		help += '  ' + optDefn.description;
		if (optDefn.dependencies) {
			help += `\n        Dependent options: ${optDefn.dependencies.join(', ')}`;
		}
		help += '\n';
	}

	console.log(help);
}

function parseCLIArgs() {
	let argv = process.argv.slice(2);

	/** @type {ProgramOptsDefns} */
	const programOptsDefns = [
		{ name: 'dry', isBoolean: true,
			description: 'Does not call ab-av1, just logs' },
		{ name: 'file-list', alias: 'l', required: true,
			description: 'Path to a file with line-separated filepaths of videos to process' },
		{ name: 'output-dir', alias: 'od', dependencies: [ 'rel-dir' ],
			description: 'Output directory for files. If omitted, then generated files are created in their original directory with "file.av1.ext"' },
		// TODO might change this into "input-dir"
		{ name: 'rel-dir', alias: 'rd', dependencies: [ 'output-dir' ],
			description: "Relative directory. Determines an output file's directory structure relative from rel-dir to the input file's directory" }
	];
	const programOptsDefnsCamelCased = programOptsDefns.map(opt => {
		return {
			name: kebabCaseToCamelCase(opt.name),
			alias: opt.alias,
			required: opt.required,
			dependencies: opt.dependencies?.map(kebabCaseToCamelCase)
		};
	})

	/**
	 * @type {{
	 *   dry?: boolean;
	 *   fileList: string;
	 *   outputDir?: string;
	 *   relDir?: string;
	 * }}
	 */
	let parsedOpts = {};
	/** @type {string[]} */
	let positionalArgs = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('-')) {
			let opt;
			if (argv[i].startsWith('--')) {
				let name = argv[i].substring(2);
				opt = programOptsDefns.find(opt => opt.name === name);
			} else {
				let alias = argv[i].substring(1);
				opt = programOptsDefns.find(opt => opt.alias === alias);
			}

			if (opt == null) {
				positionalArgs.push(argv[i], argv[i+1]);
				i++;
				continue;
			} else if (opt.isBoolean) {
				parsedOpts[kebabCaseToCamelCase(opt.name)] = true;
				continue;
			}

			let optValue = argv[i+1];
			parsedOpts[kebabCaseToCamelCase(opt.name)] = optValue;

			i++;
		} else {
			positionalArgs.push(argv[i]);
		}
	}

	for (let opt of programOptsDefnsCamelCased) {
		// verifying required options
		if (opt.required && parsedOpts[opt.name] == null) {
			console.error(`Missing required option --${opt.name}`);
			printHelp(programOptsDefns);
			process.exit(1);
		}

		if (parsedOpts[opt.name] != null && opt.dependencies != null) {
			let missingDependencies = opt.dependencies.filter(
				depOptName => parsedOpts[depOptName] == null
			);

			if (missingDependencies.length) {
				console.error(`Option ${opt.name} was provided, but is missing dependent options: ${missingDependencies.join(', ')}`);
				printHelp(programOptsDefns);
				process.exit(1);
			}
		}
	}

	let abAv1Command = positionalArgs[0];
	if (abAv1Command == null) {
		console.error('An ab-av1 command is required');
		printHelp(programOptsDefns);
		process.exit(1);
	}

	return {
		opts: parsedOpts,
		args: positionalArgs
	};
}

function printDivider() {
	console.log('\n==========================\n');
}

(async () => {
	let { opts, args: abAv1Args } = parseCLIArgs();

	console.log('options:', JSON.stringify(opts));
	console.log('ab-av1 arguments:', abAv1Args.join(' '));

	const abAv1Command = abAv1Args[0];

	let videoFiles = fs.readFileSync(opts.fileList, 'utf-8').toString()
		.split(/\r?\n/)
		.filter(line => line.length);

	for (let videoFile of videoFiles) {
		printDivider();

		if (videoFile.match(/\.av1\..+$/)) {
			console.log(`${videoFile} is already an AV1 file (based on filename)`);
			continue;
		}

		videoFile = path.resolve(videoFile);
		let { name: filenameWithoutExt, ext } = path.parse(videoFile);
		let videoDir = path.dirname(videoFile);

		let av1OutputFilename = filenameWithoutExt + '.av1' + ext;
		let av1OutputFilepath;
		if (opts.outputDir) {
			let relativePathToVideoDir = path.relative(opts.relDir, videoDir);
			av1OutputFilepath = path.join(opts.outputDir, relativePathToVideoDir, av1OutputFilename);
		} else {
			av1OutputFilepath = path.join(videoDir, av1OutputFilename);
		}

		if (fs.existsSync(av1OutputFilepath)) {
			console.log(`${videoFile} output file already exists -- ${av1OutputFilepath}`);
			continue;
		}

		function handleSIGINT() {
			console.log('ABORTING');
			let abortMsg = 'Parent process captured SIGINT -- aborting child process and exiting bulk-ab-av1';
			abortController.abort(abortMsg);
			console.error(abortMsg);
			process.exit(1);
		}
		process.on('SIGINT', handleSIGINT);

		let abortController = new AbortController();

		let spawnPromise = new Promise((res, rej) => {
			try {
				let spawnArgs = abAv1Args.slice(0);
				spawnArgs.push('-i', videoFile);
				spawnArgs.push('--temp-dir', videoDir);
				// do not add output option for certain ab-av1 commands
				switch (abAv1Command) {
					case 'sample-encode':
					case 'vmaf':
					case 'crf-search':
						console.debug(`Not adding "-o" to ab-av1 args since command is ${abAv1Command}`);
						break;
					default:
						// output option is optional for these commands, so only specify it
						// if --output-dir was provided
						if (opts.outputDir != null) {
							spawnArgs.push('-o', av1OutputFilepath);
						}
						break;
				}

				if (opts.dry) {
					console.log(`DRY Spawning ab-av1 ${spawnArgs.join(' ')}`);
					res();
					return;
				}

				console.log(`Spawning ab-av1 ${spawnArgs.join(' ')}`);
				let task = spawn('ab-av1', spawnArgs, {
					signal: abortController.signal,
					stdio: ['inherit', 'inherit', 'inherit']
				});

				task.on('error', rej);
				task.on('exit', (code, signal) => {
					if (signal != null) {
						rej(`Process exited with NodeJS signal ${signal}`);
						return;
					} else if (code !== 0) {
						rej(`Process exited with code ${code}`);
						return;
					}

					res();
				});
			} catch (err) {
				rej(err);
			}
		});

		await spawnPromise
			.catch(err => console.error(`Failed to process ${videoFile}: `, JSON.stringify(err)));
			.finally(() => process.removeListener('SIGINT', handleSIGINT));
	}
})().catch(err => {
	console.error(err);
	process.exit(1);
});
