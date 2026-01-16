import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const mainConfig = {
    entryPoints: ['src/main.ts', 'src/reset-password.ts'],
    bundle: true,
    outdir: 'dist',
    format: 'esm',
    platform: 'browser',
    target: ['es2020', 'chrome90', 'firefox88', 'safari14'],
    splitting: true,
    minify: !isWatch,
    sourcemap: isWatch,
    treeShaking: true,
    define: {
        'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    },
    logLevel: 'info',
};

/** @type {esbuild.BuildOptions} */
const swConfig = {
    entryPoints: ['sw.ts'],
    bundle: true,
    outfile: 'dist/sw.js',
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: !isWatch,
    sourcemap: isWatch,
    logLevel: 'info',
};

async function build() {
    if (isWatch) {
        const mainCtx = await esbuild.context(mainConfig);
        const swCtx = await esbuild.context(swConfig);
        await Promise.all([mainCtx.watch(), swCtx.watch()]);
        console.log('Watching for changes...');
    } else {
        await Promise.all([
            esbuild.build(mainConfig),
            esbuild.build(swConfig),
        ]);
        console.log('Build complete!');
    }
}

build().catch(() => process.exit(1));
