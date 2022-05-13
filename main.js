/**

Adapted from Markdeep 1.11 by Morgan McGuire (https://casual-effects.com)

The purpose here is to adapt and extend Markdeep for use outside of a
browser context (Node). Additionally, styling will be applied via external
stylesheets rather than embedded in the output. Language options are
removed; only English is supported.

Any renaming of types and functions for the purposes of code minification
has been removed in favor of readability.


Markdeep was created by Morgan McGuire. It extends the work of:

	- John Gruber's original Markdown
	- Ben Hollis' Maruku Markdown dialect
	- Michel Fortin's Markdown Extras dialect
	- Ivan Sagalaev's highlight.js
	- Contributors to the above open source projects


You may use, extend, and redistribute this code under the terms of
the BSD license at https://opensource.org/licenses/BSD-2-Clause.


This module contains code adapted from the following projects:

markdeep.min.js 1.11 (C) 2020 Morgan McGuire https://casual-effects.com/markdeep

**/


const markdeeper = require('./src/Markdeeper');
module.exports = markdeeper;


/*

// FOR TESTING...

const fs = require('fs');

!async function main() {
	var str = fs.readFileSync('./test.md');
	str = await markdeeper.processDocument(str);
	fs.writeFileSync('./output.html', str);
}();
*/