import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function required(value, label) {
	if (!value?.trim()) throw new Error(`${label} is required`);
	return value.trim();
}

function readSignature(path) {
	return required(readFileSync(path, "utf8"), `signature ${path}`);
}

export function createWindowsUpdaterManifest({
	version,
	pubDate,
	notes,
	baseUrl,
	nsisPath,
	nsisSignature,
}) {
	const normalizedVersion = required(version, "version").replace(/^v/u, "");
	if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(normalizedVersion)) {
		throw new Error(`invalid semantic version: ${version}`);
	}
	const normalizedBaseUrl = required(baseUrl, "baseUrl").replace(/\/+$/u, "");
	const normalizedPubDate = new Date(required(pubDate, "pubDate")).toISOString();
	const urlFor = (path) =>
		`${normalizedBaseUrl}/${encodeURIComponent(basename(required(path, "artifact path")))}`;

	return {
		version: normalizedVersion,
		notes: notes ?? "See the GitHub release notes.",
		pub_date: normalizedPubDate,
		platforms: {
			"windows-x86_64": {
				signature: required(nsisSignature, "NSIS signature"),
				url: urlFor(nsisPath),
			},
		},
	};
}

function parseArgs(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) {
		const key = argv[index];
		const value = argv[index + 1];
		if (!key?.startsWith("--") || value === undefined) {
			throw new Error(`invalid argument near ${key ?? "<end>"}`);
		}
		values[key.slice(2)] = value;
	}
	return values;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = parseArgs(process.argv.slice(2));
	const nsisPath = resolve(required(args.nsis, "--nsis"));
	const manifest = createWindowsUpdaterManifest({
		version: args.version,
		pubDate: args["pub-date"] ?? new Date().toISOString(),
		notes: args.notes,
		baseUrl: args["base-url"],
		nsisPath,
		nsisSignature: readSignature(resolve(args["nsis-sig"] ?? `${nsisPath}.sig`)),
	});
	const output = resolve(required(args.output, "--output"));
	writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	console.log(`[updater-manifest] wrote ${output}`);
}
