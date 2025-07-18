import type { Plugin } from 'vite';

import {
  EXTENSIONS,
  SRC_CLIENT_ENTRY,
  SRC_SERVER_ENTRY,
} from '../builder/constants.js';
import { extname, joinPath, filePathToFileURL } from '../utils/path.js';

const stripExt = (fname: string) => {
  const ext = extname(fname);
  return ext ? fname.slice(0, -ext.length) : fname;
};

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export const getManagedEntries = (
  filePath: string,
  srcDir: string,
  options: { pagesDir: string; apiDir: string },
) => `
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default fsRouter(
  '${filePathToFileURL(filePath)}',
  (file) => import.meta.glob('/${srcDir}/pages/**/*.{${EXTENSIONS.map((ext) =>
    ext.replace(/^\./, ''),
  ).join(',')}}')[\`/${srcDir}/pages/\${file}\`]?.(),
  { pagesDir: '${options.pagesDir}', apiDir: '${options.apiDir}' },
);
`;

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export const getManagedMain = () => `
import { StrictMode, createElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = createElement(StrictMode, null, createElement(Router));

if (globalThis.__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
`;

export function rscManagedPlugin(opts: {
  basePath: string;
  srcDir: string;
  pagesDir: string;
  apiDir: string;
  addEntriesToInput?: boolean;
  addMainToInput?: boolean;
}): Plugin {
  let entriesFile: string | undefined;
  let mainFile: string | undefined;
  const mainPath = `${opts.basePath}${opts.srcDir}/${SRC_CLIENT_ENTRY}`;
  return {
    name: 'rsc-managed-plugin',
    enforce: 'pre',
    configResolved(config) {
      entriesFile = joinPath(config.root, opts.srcDir, SRC_SERVER_ENTRY);
      mainFile = joinPath(config.root, opts.srcDir, SRC_CLIENT_ENTRY);
    },
    options(options) {
      if (typeof options.input === 'string') {
        throw new Error('string input is unsupported');
      }
      if (Array.isArray(options.input)) {
        throw new Error('array input is unsupported');
      }
      return {
        ...options,
        input: {
          ...(opts.addEntriesToInput && { [SRC_SERVER_ENTRY]: entriesFile! }),
          ...(opts.addMainToInput && { [SRC_CLIENT_ENTRY]: mainFile! }),
          ...options.input,
        },
      };
    },
    async resolveId(id, importer, options) {
      const resolved = await this.resolve(id, importer, options);
      if (!resolved || resolved.id === id) {
        if (id === entriesFile) {
          return '\0' + entriesFile + '.js';
        }
        if (id === mainFile) {
          return '\0' + mainFile + '.js';
        }
        if (stripExt(id) === mainPath) {
          return '\0' + mainPath + '.js';
        }
      }
    },
    load(id) {
      if (id === '\0' + entriesFile + '.js') {
        return getManagedEntries(entriesFile + '.js', opts.srcDir, {
          apiDir: opts.apiDir,
          pagesDir: opts.pagesDir,
        });
      }
      if (id === '\0' + mainFile + '.js' || id === '\0' + mainPath + '.js') {
        return getManagedMain();
      }
    },
  };
}
