#!/usr/bin/env node
/**
 * create-ware — scaffold a new Bazaar ware project.
 *
 * Usage:
 *   npm create ware@latest
 *   npm create ware@latest my-ware
 *   npx create-ware my-invoice-app
 */

import * as p from '@clack/prompts';
import { execSync }      from 'node:child_process';
import { existsSync }    from 'node:fs';
import { cp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath( new URL( '.', import.meta.url ) );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a display name to a slug (lowercase, hyphens). */
function toSlug( name ) {
  return name
    .toLowerCase()
    .replace( /[^a-z0-9]+/g, '-' )
    .replace( /^-+|-+$/g, '' );
}

/** Replace all __PLACEHOLDER__ tokens in a string. */
function applyTokens( content, tokens ) {
  return Object.entries( tokens ).reduce(
    ( str, [ key, val ] ) => str.replaceAll( `__${ key }__`, val ),
    content,
  );
}

/**
 * Walk a directory recursively and call `cb` for every file.
 * @param {string} dir
 * @param {(filePath: string) => Promise<void>} cb
 */
async function walkFiles( dir, cb ) {
  const entries = await readdir( dir, { withFileTypes: true } );
  for ( const entry of entries ) {
    const full = join( dir, entry.name );
    if ( entry.isDirectory() ) {
      await walkFiles( full, cb );
    } else {
      await cb( full );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log( '' );
  p.intro( 'create-ware — scaffold a new Bazaar ware' );

  // 1. Project directory / ware name
  const argName    = process.argv[ 2 ];
  const nameAnswer = argName
    ? argName
    : await p.text( {
        message:     'Ware name',
        placeholder: 'My Awesome Ware',
        validate:    v => ( v.trim() ? undefined : 'Name is required.' ),
      } );

  if ( p.isCancel( nameAnswer ) ) {
    p.cancel( 'Cancelled.' );
    process.exit( 0 );
  }

  const wareName = String( nameAnswer ).trim();
  const defaultSlug = toSlug( wareName );

  // 2. Slug
  const slugAnswer = await p.text( {
    message:     'Ware slug',
    placeholder: defaultSlug,
    initialValue: defaultSlug,
    validate: v => {
      if ( ! v.trim() ) return 'Slug is required.';
      if ( ! /^[a-z0-9-]+$/.test( v ) ) return 'Slug must be lowercase letters, numbers, and hyphens only.';
    },
  } );

  if ( p.isCancel( slugAnswer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
  const wareSlug = String( slugAnswer ).trim();

  // 3. Author
  const authorAnswer = await p.text( {
    message: 'Author',
    placeholder: 'Your Name',
  } );
  if ( p.isCancel( authorAnswer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
  const wareAuthor = String( authorAnswer ).trim() || 'Unknown';

  // 4. Description
  const descAnswer = await p.text( {
    message: 'Description (optional)',
    placeholder: 'A short description of what this ware does',
  } );
  if ( p.isCancel( descAnswer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
  const wareDesc = String( descAnswer ).trim();

  // 5. Framework
  const framework = await p.select( {
    message: 'Framework',
    options: [
      { value: 'react',   label: 'React + TypeScript',  hint: 'recommended' },
      { value: 'vue',     label: 'Vue 3 + TypeScript' },
      { value: 'vanilla', label: 'Vanilla TypeScript' },
    ],
  } );
  if ( p.isCancel( framework ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }

  // 5b. Storybook
  const wantStorybook = framework === 'react'
    ? await p.confirm( { message: 'Include Storybook? (React only)', initialValue: false } )
    : false;
  if ( p.isCancel( wantStorybook ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }

  // 6. Target directory
  const dirAnswer = await p.text( {
    message:      'Output directory',
    initialValue: wareSlug,
    placeholder:  wareSlug,
    validate: v => {
      if ( ! v.trim() ) return 'Directory is required.';
      if ( existsSync( resolve( process.cwd(), v ) ) ) {
        return `"${ v }" already exists. Choose a different name.`;
      }
    },
  } );
  if ( p.isCancel( dirAnswer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
  const outDir = resolve( process.cwd(), String( dirAnswer ).trim() );

  // ---------------------------------------------------------------------------
  // Copy template
  // ---------------------------------------------------------------------------
  const templateDir = join( __dirname, 'templates', String( framework ) );
  const tokens = {
    WARE_NAME:    wareName,
    WARE_SLUG:    wareSlug,
    WARE_AUTHOR:  wareAuthor,
    WARE_DESC:    wareDesc,
    WARE_VERSION: '0.1.0',
  };

  const s = p.spinner();
  s.start( 'Scaffolding project…' );

  // Copy template directory to target.
  await cp( templateDir, outDir, { recursive: true } );

  // Replace placeholder tokens in every file.
  await walkFiles( outDir, async filePath => {
    const raw = await readFile( filePath, 'utf8' );
    await writeFile( filePath, applyTokens( raw, tokens ), 'utf8' );
  } );

  // Rename _package.json → package.json and _gitignore → .gitignore
  // (npm strips dotfiles and package.json from "files" during publish, so we
  // store them with a leading underscore and rename after copying.)
  const renames = [
    [ '_package.json', 'package.json' ],
    [ '_gitignore',    '.gitignore'   ],
    [ '_env.local',    '.env.local'   ],
  ];
  for ( const [ from, to ] of renames ) {
    const src = join( outDir, from );
    if ( existsSync( src ) ) {
      await rename( src, join( outDir, to ) );
    }
  }

  // Optionally remove Storybook files if not wanted.
  if ( ! wantStorybook ) {
    const { rm } = await import( 'node:fs/promises' );
    const storybookDir   = join( outDir, '.storybook' );
    const storiesDir     = join( outDir, 'src', 'stories' );
    if ( existsSync( storybookDir ) ) await rm( storybookDir, { recursive: true, force: true } );
    if ( existsSync( storiesDir   ) ) await rm( storiesDir,   { recursive: true, force: true } );

    // Strip storybook deps from package.json.
    const pkgPath = join( outDir, 'package.json' );
    if ( existsSync( pkgPath ) ) {
      const pkg = JSON.parse( await readFile( pkgPath, 'utf8' ) );
      const devDeps = pkg.devDependencies ?? {};
      for ( const key of Object.keys( devDeps ) ) {
        if ( key.startsWith( '@storybook/' ) || key === 'storybook' ) delete devDeps[ key ];
      }
      const scripts = pkg.scripts ?? {};
      delete scripts.storybook;
      delete scripts[ 'build-storybook' ];
      await writeFile( pkgPath, JSON.stringify( pkg, null, 2 ) + '\n', 'utf8' );
    }
  }

  s.stop( 'Project scaffolded.' );

  const sbHint = wantStorybook ? '\n  npm run storybook        # open Storybook' : '';

  // ---------------------------------------------------------------------------
  // Next steps
  // ---------------------------------------------------------------------------
  p.outro(
    [
      `\nYour ware is ready in ./${ String( dirAnswer ).trim() }\n`,
      'Next steps:\n',
      `  cd ${ String( dirAnswer ).trim() }`,
      '  npm install',
      '  npm run dev              # start Vite dev server',
      `  wp bazaar dev start ${ wareSlug } http://localhost:5173`,
      '                           # link dev server to wp-admin (in another terminal)',
      sbHint,
      '\nWhen ready to ship:',
      '  npm run package          # build + zip → ' + wareSlug + '.wp',
      '  wp bazaar install ' + wareSlug + '.wp',
    ].filter( l => l !== '' ).join( '\n' ),
  );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
