const fs = require('fs');
const path = require('path');

function walkSync(currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach(function (name) {
        var filePath = path.join(currentDirPath, name);
        try {
            var stat = fs.statSync(filePath);
            if (stat.isFile()) {
                callback(filePath, stat);
            } else if (stat.isDirectory()) {
                if (!filePath.includes('node_modules') && !filePath.includes('.git') && !filePath.includes('target') && !filePath.includes('build-dir') && !filePath.includes('.flatpak-builder')) {
                    walkSync(filePath, callback);
                }
            }
        } catch (e) {
            // ignore permission errors
        }
    });
}

walkSync('.', function(filePath, stat) {
    if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.webp') || filePath.endsWith('.ico') || filePath.endsWith('.icns')) return;
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;
        content = content.replace(/Naia OS/g, 'Naia OS');
        content = content.replace(/Naia-OS/g, 'Naia-OS');
        content = content.replace(/naia-os/g, 'naia-os');
        content = content.replace(/naia\.nextain\.io/g, 'naia.nextain.io');
        content = content.replace(/\bnan\b/g, 'naia');
        content = content.replace(/\bNan\b/g, 'Naia');
        content = content.replace(/io\.nextain\.naia/g, 'io.nextain.naia');
        content = content.replace(/naia-shell/g, 'naia-shell');
        content = content.replace(/naia-gateway/g, 'naia-gateway');
        
        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Updated:', filePath);
        }
    } catch (e) {
        // ignore
    }
});
