const fs = require('fs');
const path = require('path');

const cssDir = path.join(__dirname, '../static/css');
const files = ['smart-canvas.css', 'canvas.css', 'canvas-list.css', 'api-settings.css', 'theme.css'];

function formatCssRuleBlock(content) {
    // Expand single-line packed rules `{ prop:val; prop2:val2; }` into clean multi-line rules
    return content.replace(/([^{};]+)\{([^{}]+)\}/g, (match, selector, body) => {
        const cleanSel = selector.trim();
        const decls = body
            .split(';')
            .map(d => d.trim())
            .filter(Boolean);
        
        if (decls.length === 0) return `${cleanSel} {}`;
        if (decls.length === 1 && decls[0].length < 50) {
            return `${cleanSel} { ${decls[0]}; }`;
        }
        
        const indentedDecls = decls.map(d => `    ${d};`).join('\n');
        return `${cleanSel} {\n${indentedDecls}\n}`;
    });
}

function processCssFile(file) {
    const filePath = path.join(cssDir, file);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Normalize newlines
    content = content.replace(/\r\n/g, '\n');
    
    // Split @import
    content = content.replace(/(@import[^;]+;)([^\n])/g, '$1\n\n$2');
    
    // Expand rules that were concatenated on a single line like `} .foo {` -> `}\n.foo {`
    content = content.replace(/\}\s*([^\s{}][^{}]*)\{/g, '}\n\n$1 {');
    content = content.replace(/\}\s*([a-zA-Z0-9_.*#-]+)\s*\{/g, '}\n\n$1 {');
    
    // Format each rule block
    let formatted = formatCssRuleBlock(content);
    
    // Clean spaces around selector boundaries
    formatted = formatted.replace(/\}\s*([^\s{}]+)/g, '}\n\n$1');
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    fs.writeFileSync(filePath, formatted, 'utf8');
    console.log(`[CSS Optimizer] Successfully formatted and expanded: ${file}`);
}

files.forEach(processCssFile);
