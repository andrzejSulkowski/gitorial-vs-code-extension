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
        // Create destination directory if it doesn't exist
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        // Read all items in the source directory
        const items = fs.readdirSync(src);
        
        items.forEach(item => {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            
            const stats = fs.statSync(srcPath);
            
            if (stats.isDirectory()) {
                // Recursively move subdirectories
                moveDirContents(srcPath, destPath);
                // Remove the now-empty source directory
                fs.rmdirSync(srcPath);
            } else {
                // Move files
                fs.renameSync(srcPath, destPath);
            }
        });
    }

    // Move everything from src to out
    moveDirContents(srcDir, outDir);
    
    // Remove the now-empty src directory
    fs.rmdirSync(srcDir);
    console.log('Moved files from src to output root');
} 