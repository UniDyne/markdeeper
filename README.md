# Markdeeper

Markdeeper attempts to build upon Morgan McGuire's awesome [Markdeep](https://casual-effects.com/markdeep/)
project in order to create an offline processor with similar capabilities. This will be used in a separate
project to create static documentation and PDF documents.

Additionally, ideas have been borrowed from the [markdeep-thesis](https://github.com/doersino/markdeep-thesis/)
project, which makes use of Markdeep and a couple other libraries in order to produce beautifully typeset
documents.

The original Markdeep source is a single massive file with minification, embedded styling, browser dependency
and numerous other things that make it intimidating to tinker with. This project breaks a lot of that down and
removes things that are not absolutely necessary. For example, polyfills, internationalization, and various
browser hacks are absent. Styling has been moved to a separate CSS file. Code has been modularized and grouped
according to purpose.

### Future Work

This is very much a work in progress. There are still many things to clean up and many bugs to squash. Further,
there are some differences between the in-browser processing of Markdeep and the offline processing of this
project that I have yet to tackle. Time and my own goals dictate what, if anything, gets fixed.

Currently, this project is designed to take Markdown and return the equivalent HTML. Future work will include the ability to output complete HTML documents and PDFs directly to file, and to handle TOC such that the caller can decide what to do with it.

For now, this project will be used in my [nanosite](https://github.com/unidyne/nanosite/) project for Markdown processing.


### License

You may use this repository's contents under the terms of the *BSD 2-Clause "Simplified" License*, see `LICENSE`.

### Credits

Markdeeper is based on Markdeep and also makes use of highlight.js and MathJax. Both highlight.js and MathJax are referenced separately in the package.json and are not directly included in this repository.

* Morgan McGuire's **Markdeep** is *also* licensed under the *BSD 2-Clause "Simplified" License*, see [here](https://casual-effects.com/markdeep/#license).
* Markdeeper uses Ivan Sagalaev's **highlight.js** with its *BSD 3-Clause License*, see [here](https://github.com/highlightjs/highlight.js/blob/master/LICENSE).
* **MathJax** is licensed under the *Apache License 2.0*, see [here](https://github.com/mathjax/MathJax/blob/master/LICENSE).
