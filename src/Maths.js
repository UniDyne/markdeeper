import mathjax from 'mathjax';


const RXMATHS = [
    /\$\$(.+?)\$\$/gs,
    /(\\begin\{equation\}.*?\\end\{equation\})/gs,
    /(\\begin\{eqnarray\}.*?\\end\{eqnarray\})/gs,
    /(\\begin\{equation\*\}.*?\\end\{equation\*\})/gs
];

const RXINLINE = /\\\((.+?)\\\)/g;


export default async function processMaths(str) {
    const mathjax = await import('mathjax').init({ tex: { equationNumbers: {autoNumber:"AMS"}} });

    /*
    mathjax.config({
        MathJax: {
            TeX: { equationNumbers: {autoNumber:"AMS"}}
        }
    });*/
    //mathjax.start();

    let inline = false;
    function processTeX(tex) {
        return new Promise(resolve => {
            // typeset custom commands
            mathjax.typeset({
                math: tex,
                format: inline ? "inline-TeX" : "TeX",
                svg: true
            }, function(data) {
                if(data.errors) {
                    console.log(data.errors);
                    resolve('');
                } else {
                    if(inline) resolve(data.svg);
                    else resolve(`<div class="MathJax" style="text-align:center">${data.svg}</div>`);
                }
            });
        });
    }

    // setup custom commands
    await processTeX('$$NC{\\n}{\\hat{n}}NC{\\thetai}{\\theta_\\mathrm{i}}NC{\\thetao}{\\theta_\\mathrm{o}}NC{\\d}[1]{\\mathrm{d}#1}NC{\\w}{\\hat{\\omega}}NC{\\wi}{\\w_\\mathrm{i}}NC{\\wo}{\\w_\\mathrm{o}}NC{\\wh}{\\w_\\mathrm{h}}NC{\\Li}{L_\\mathrm{i}}NC{\\Lo}{L_\\mathrm{o}}NC{\\Le}{L_\\mathrm{e}}NC{\\Lr}{L_\\mathrm{r}}NC{\\Lt}{L_\\mathrm{t}}NC{\\O}{\\mathrm{O}}NC{\\degrees}{{^{\\large\\circ}}}NC{\\T}{\\mathsf{T}}NC{\\mathset}[1]{\\mathbb{#1}}NC{\\Real}{\\mathset{R}}NC{\\Integer}{\\mathset{Z}}NC{\\Boolean}{\\mathset{B}}NC{\\Complex}{\\mathset{C}}NC{\\un}[1]{\\,\\mathrm{#1}}$$\n'.replace(/NC/g, '\\newcommand'));

    // not performant - need to replace with better async replacer
    // https://stackoverflow.com/questions/33631041/javascript-async-await-in-replace
    async function replaceAsync(str, rx) {
        const promises = [];
        str.replace(rx, (match, p0) => {
            const promise = processTeX(p0);
            promises.push(promise);
        });
        const data = await Promise.all(promises);
        return str.replace(rx, () => data.shift());
    }

    // replace block maths...
    for(let i = 0; i < RXMATHS.length; i++)
        str = await replaceAsync(str, RXMATHS[i]);

    // replace inline maths \( ... \)
    inline = true;
    str = await replaceAsync(str, RXINLINE);
    
    
    return str;
}