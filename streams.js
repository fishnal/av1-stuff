/**
 * Does not add listeners directly onto a readable stream - this way stream data
 * can still be processed from outside this class.
 *
 * Add a callback via `onLine`
 *
 * Call `onData` each time data is emitted from a stream.
 * Call `onEnd` once stream has ended.
 */
class StreamLineParser {
	constructor() {
		/**
		 * @type {string}
		 */
		this._currData = '';
		/**
		 * @type {null | ((line: string) => void)}
		 */
		this._cb = null;
	}

	/**
	 * @param {(line: string) => void} cb
	 */
	onLine(cb) {
		this._cb = cb;
	}

	/**
	 * @param {string | Buffer} data
	 */
	onData(data) {
		this._currData += data.toString();

		let newLineIndex;
		while (this._cb != null && (newLineIndex = this._currData.indexOf('\n')) >= 0) {
			let line = this._currData.substring(0, newLineIndex);
			this._currData = this._currData.substring(newLineIndex+1);
			this._cb(line);
		}
	}

	onEnd() {
		if (this._currData !== '') {
			this._cb?.(this._currData);
			this._currData = '';
		}
	}
}
