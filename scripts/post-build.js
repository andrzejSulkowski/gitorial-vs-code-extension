const fs = require('fs');
const path = require('path');

// Paths
const outDir = path.join(__dirname, '../out');
const sharedDir = path.join(outDir, 'shared');

// Remove shared directory from output
if (fs.existsSync(sharedDir)) {
    fs.rmSync(sharedDir, { recursive: true, force: true });
    console.log('Cleaned up shared directory from output');
}

// Move all files from src to root of out
const srcDir = path.join(outDir, 'src');
if (fs.existsSync(srcDir)) {
    function moveDirContents(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const items = fs.readdirSync(src);
        
        items.forEach(item => {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            
            const stats = fs.statSync(srcPath);
            
            if (stats.isDirectory()) {
                moveDirContents(srcPath, destPath);
                fs.rmdirSync(srcPath);
            } else {
                fs.renameSync(srcPath, destPath);
            }
        });
    }

    moveDirContents(srcDir, outDir);
    
    fs.rmdirSync(srcDir);
    console.log('Moved files from src to output root');
} 
