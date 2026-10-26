/** Les fichiers `.wasm` sont embarqués dans `main.js` par esbuild (chargeur `binary`). */
declare module "*.wasm" {
	const bytes: Uint8Array;
	export default bytes;
}
