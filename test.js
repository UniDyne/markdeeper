import { processDocument } from './main.js';

import fs from 'node:fs';

!async function main() {
	let str = fs.readFileSync('./test.md');
	let doc = await processDocument(str);
	fs.writeFileSync('./output.html', doc.content);
    console.log(doc.toc);
}();

