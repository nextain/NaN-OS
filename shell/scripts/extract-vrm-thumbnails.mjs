import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const avatarsDir = path.join(process.cwd(), "public", "avatars");
const files = fs.readdirSync(avatarsDir).filter(f => f.endsWith(".vrm"));

for (const file of files) {
	const vrmPath = path.join(avatarsDir, file);
	const buf = fs.readFileSync(vrmPath);
	
	// GLB Header: 12 bytes
	const magic = buf.readUInt32LE(0);
	if (magic !== 0x46546C67) continue; // 'glTF'
	
	const jsonChunkLength = buf.readUInt32LE(12);
	const jsonType = buf.readUInt32LE(16);
	if (jsonType !== 0x4E4F534A) continue; // 'JSON'
	
	const jsonBuf = buf.slice(20, 20 + jsonChunkLength);
	const gltf = JSON.parse(jsonBuf.toString("utf-8"));
	
	// VRM 0.0 or 1.0 thumbnail index
	let thumbIndex = -1;
	if (gltf.extensions?.VRM?.meta?.texture !== undefined) {
		thumbIndex = gltf.extensions.VRM.meta.texture;
	} else if (gltf.extensions?.VRMC_vrm?.meta?.thumbnailImage !== undefined) {
		thumbIndex = gltf.extensions.VRMC_vrm.meta.thumbnailImage;
	}
	
	if (thumbIndex !== -1 && gltf.images && gltf.images[thumbIndex]) {
		const imageDef = gltf.images[thumbIndex];
		const bufferViewIndex = imageDef.bufferView;
		if (bufferViewIndex !== undefined && gltf.bufferViews) {
			const bv = gltf.bufferViews[bufferViewIndex];
			
			// Bin Chunk
			const binChunkOffset = 20 + jsonChunkLength;
			const binChunkLength = buf.readUInt32LE(binChunkOffset);
			const binType = buf.readUInt32LE(binChunkOffset + 4);
			if (binType === 0x004E4942) { // 'BIN\0'
				const binDataOffset = binChunkOffset + 8;
				const imgData = buf.slice(
					binDataOffset + bv.byteOffset,
					binDataOffset + bv.byteOffset + bv.byteLength
				);
				
				const ext = imageDef.mimeType === "image/jpeg" ? ".jpg" : ".png";
				const outPath = path.join(avatarsDir, file.replace(".vrm", ext));
				fs.writeFileSync(outPath, imgData);
				console.log(`Extracted: ${outPath}`);
				
				// Convert to webp
				const webpPath = outPath.replace(ext, ".webp");
				try {
					execSync(`cwebp -q 80 "${outPath}" -o "${webpPath}"`, { stdio: "ignore" });
					fs.unlinkSync(outPath); // Clean up original
					console.log(`Converted to WebP: ${webpPath}`);
				} catch (e) {
					console.log(`Failed to convert ${outPath} to WebP`);
				}
			}
		}
	}
}
