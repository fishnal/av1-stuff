Processing a bulk amount of files with `ab-av1`.

Might rename it to `auto-ab-av1` instead of `bulk-...` since I'm planning to add features to, optionally, automatically reduce the `min-vmaf` and/or `preset` when `ab-av1 crf-search|auto-encode` fails because a "suitable CRF could not be found"
- Only allow auto tweaking min-vmaf and preset when `auto-tweak` is provided
- Default will reduce `min-vmaf` first, which _should(?)_ prioritize file size, but can provide an option to reduce `preset` first instead of the min-vmaf.
	- `prefer-size` -- reduce min-vmaf first then preset (default)
	- `prefer-quality` -- reduce preset only, but never reduce min-vmaf
	- `prefer-some-quality` -- reduce preset first, then reduce min-vmaf
	- `no-auto-vmaf` and `no-auto-preset` to not reduce min-vmaf or preset respectively
	-
