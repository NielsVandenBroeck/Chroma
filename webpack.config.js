const path = require("path");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "development",

    // 1. Multiple Entry Points: Tell Webpack about both games
    entry: {
        hub: "./src/hub.js",
        chroma: "./src/game.js",
        flagle: "./src/flagle-game.js"
    },

    output: {
        path: path.resolve(__dirname, 'dist'),
        // 2. Dynamic Output: Generates chroma.bundle.js and flagle.bundle.js
        filename: '[name].bundle.js',
        clean: true,
    },

    plugins: [
        // 3. The Hub (Main Menu)
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['hub']
        }),

        // 4. Chroma Game
        new HtmlWebpackPlugin({
            template: './public/chroma.html',
            filename: 'chroma.html',
            chunks: ['chroma'] // Only injects chroma.bundle.js
        }),

        // 5. Flagle Game
        new HtmlWebpackPlugin({
            template: './public/flagle.html',
            filename: 'flagle.html',
            chunks: ['flagle'] // Only injects flagle.bundle.js
        }),

        // 6. Copy your CSS (make sure all your CSS files are listed here)
        new CopyWebpackPlugin({
            patterns: [
                { from: './public/style.css', to: 'style.css' },
                { from: './public/flagle-style.css', to: 'flagle-style.css' }
                // Add any other static assets (like images) here if needed
            ]
        })
    ],
};