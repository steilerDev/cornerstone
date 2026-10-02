const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { DefinePlugin } = require('webpack');
const rootPkg = require('../package.json');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/main.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.jsx': ['.tsx', '.jsx'],
      },
    },
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              // Babel 8 derives preset-react `development` from envName, which babel-loader does
              // not set from webpack's mode, so production would ship jsxDEV. Babel 8 also defaults
              // onlyRemoveTypeImports to true, which keeps `import { type X }` as side-effect imports.
              presets: [
                ['@babel/preset-react', { runtime: 'automatic', development: !isProduction }],
                ['@babel/preset-typescript', { onlyRemoveTypeImports: false }],
              ],
            },
          },
        },
        {
          test: /\.module\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            {
              loader: 'css-loader',
              options: {
                modules: {
                  namedExport: false,
                  localIdentName: isProduction
                    ? '[local]_[hash:base64:5]'
                    : '[name]__[local]--[hash:base64:5]',
                },
              },
            },
          ],
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
          ],
        },
      ],
    },
    optimization: isProduction
      ? {
          splitChunks: {
            chunks: 'all',
          },
          runtimeChunk: 'single',
          minimizer: [
            '...',
            new CssMinimizerPlugin(),
          ],
        }
      : {},
    plugins: [
      new DefinePlugin({
        __APP_VERSION__: JSON.stringify(rootPkg.version),
      }),
      new HtmlWebpackPlugin({
        template: './index.html',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'public'),
            to: path.resolve(__dirname, 'dist'),
            noErrorOnMissing: true,
          },
        ],
      }),
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: '[name].[contenthash].css',
            }),
          ]
        : []),
    ],
    devServer: {
      port: parseInt(process.env.CLIENT_DEV_PORT || '5173', 10),
      hot: true,
      historyApiFallback: true,
      proxy: [
        {
          pathFilter: ['/api'],
          target: `http://localhost:${process.env.PORT || '3000'}`,
          changeOrigin: true,
        },
      ],
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
  };
};
