#!/usr/bin/env node
/**
 * create-ware — scaffold a new Bazaar ware project.
 *
 * Interactive usage:
 *   npm create ware@latest
 *   npm create ware@latest my-ware
 *   npx create-ware my-invoice-app
 *
 * Non-interactive (agent-friendly):
 *   npm create ware@latest my-ware -- --framework react --author "Acme" --description "Invoice app" --yes
 *   npm create ware@latest -- --name "My Ware" --framework vue --yes
 *   npm create ware@latest -- --config ./ware-spec.json
 *
 * All flags:
 *   --name        <string>          Ware display name (overrides first positional arg)
 *   --slug        <string>          Ware slug (derived from name if omitted)
 *   --author      <string>          Author name (default: Unknown)
 *   --description <string>          Short description
 *   --version     <string>          Initial version (default: 0.1.0)
 *   --framework   react|vue|vanilla Framework (default: react)
 *   --storybook                     Include Storybook (React only)
 *   --out         <path>            Output directory (default: slug)
 *   --yes / -y                      Skip all prompts, accept defaults
 *   --config      <path>            JSON file with any of the above fields
 */

import * as p from '@clack/prompts';
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

/**
 * Parse process.argv into a flags object.
 * Returns { flags, positional } where positional is an array of non-flag args.
 */
function parseArgs( argv ) {
  const flags      = {};
  const positional = [];
  let i = 2;
  while ( i < argv.length ) {
    const arg = argv[ i ];
    if ( arg === '--yes' || arg === '-y' ) {
      flags.yes = true;
      i++;
    } else if ( arg === '--storybook' ) {
      flags.storybook = true;
      i++;
    } else if ( arg.startsWith( '--' ) ) {
      const key   = arg.slice( 2 );
      const value = argv[ i + 1 ];
      if ( value !== undefined && ! value.startsWith( '--' ) ) {
        flags[ key ] = value;
        i += 2;
      } else {
        flags[ key ] = true;
        i++;
      }
    } else {
      positional.push( arg );
      i++;
    }
  }
  return { flags, positional };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { flags, positional } = parseArgs( process.argv );

  // Load --config file and merge (flags take precedence over config file).
  if ( flags.config ) {
    const configPath = resolve( process.cwd(), String( flags.config ) );
    if ( ! existsSync( configPath ) ) {
      console.error( `Error: config file not found: ${ configPath }` );
      process.exit( 1 );
    }
    const fileConfig = JSON.parse( await readFile( configPath, 'utf8' ) );
    for ( const [ k, v ] of Object.entries( fileConfig ) ) {
      if ( flags[ k ] === undefined ) flags[ k ] = v;
    }
  }

  const nonInteractive = Boolean( flags.yes );
  const VALID_FRAMEWORKS = [ 'react', 'vue', 'vanilla' ];

  if ( ! nonInteractive ) {
    console.log( '' );
    p.intro( 'create-ware — scaffold a new Bazaar ware' );
  }

  // ---------------------------------------------------------------------------
  // 1. Ware name
  // ---------------------------------------------------------------------------
  let wareName;
  if ( flags.name ) {
    wareName = String( flags.name ).trim();
  } else if ( positional[ 0 ] ) {
    wareName = String( positional[ 0 ] ).trim();
  } else if ( nonInteractive ) {
    console.error( 'Error: --name is required when using --yes.' );
    process.exit( 1 );
  } else {
    const answer = await p.text( {
      message:     'Ware name',
      placeholder: 'My Awesome Ware',
      validate:    v => ( v.trim() ? undefined : 'Name is required.' ),
    } );
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    wareName = String( answer ).trim();
  }

  const defaultSlug = toSlug( wareName );

  // ---------------------------------------------------------------------------
  // 2. Slug
  // ---------------------------------------------------------------------------
  let wareSlug;
  if ( flags.slug ) {
    wareSlug = String( flags.slug ).trim();
  } else if ( nonInteractive ) {
    wareSlug = defaultSlug;
  } else {
    const answer = await p.text( {
      message:      'Ware slug',
      placeholder:  defaultSlug,
      initialValue: defaultSlug,
      validate: v => {
        if ( ! v.trim() ) return 'Slug is required.';
        if ( ! /^[a-z0-9-]+$/.test( v ) ) return 'Slug must be lowercase letters, numbers, and hyphens only.';
      },
    } );
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    wareSlug = String( answer ).trim();
  }

  // ---------------------------------------------------------------------------
  // 3. Author
  // ---------------------------------------------------------------------------
  let wareAuthor;
  if ( flags.author ) {
    wareAuthor = String( flags.author ).trim();
  } else if ( nonInteractive ) {
    wareAuthor = 'Unknown';
  } else {
    const answer = await p.text( { message: 'Author', placeholder: 'Your Name' } );
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    wareAuthor = String( answer ).trim() || 'Unknown';
  }

  // ---------------------------------------------------------------------------
  // 4. Description
  // ---------------------------------------------------------------------------
  let wareDesc;
  if ( flags.description ) {
    wareDesc = String( flags.description ).trim();
  } else if ( nonInteractive ) {
    wareDesc = '';
  } else {
    const answer = await p.text( {
      message:     'Description (optional)',
      placeholder: 'A short description of what this ware does',
    } );
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    wareDesc = String( answer ).trim();
  }

  // ---------------------------------------------------------------------------
  // 5. Framework
  // ---------------------------------------------------------------------------
  let framework;
  if ( flags.framework ) {
    framework = String( flags.framework ).toLowerCase();
    if ( ! VALID_FRAMEWORKS.includes( framework ) ) {
      console.error( `Error: --framework must be one of: ${ VALID_FRAMEWORKS.join( ', ' ) }` );
      process.exit( 1 );
    }
  } else if ( nonInteractive ) {
    framework = 'react';
  } else {
    const answer = await p.select( {
      message: 'Framework',
      options: [
        { value: 'react',   label: 'React + TypeScript',  hint: 'recommended' },
        { value: 'vue',     label: 'Vue 3 + TypeScript' },
        { value: 'vanilla', label: 'Vanilla TypeScript' },
      ],
    } );
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    framework = answer;
  }

  // ---------------------------------------------------------------------------
  // 5b. Storybook (React only)
  // ---------------------------------------------------------------------------
  let wantStorybook;
  if ( framework !== 'react' ) {
    wantStorybook = false;
  } else if ( flags.storybook ) {
    wantStorybook = true;
  } else if ( nonInteractive ) {
    wantStorybook = false;
  } else {
    const answer = await p.confirm( { message: 'Include Storybook? (React only)', initialValue: false } );
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    wantStorybook = answer;
  }

  // ---------------------------------------------------------------------------
  // 6. Target directory
  // ---------------------------------------------------------------------------
  let outDirRelative;
  if ( flags.out ) {
    outDirRelative = String( flags.out ).trim();
  } else if ( nonInteractive ) {
    outDirRelative = wareSlug;
  } else {
    const answer = await p.text( {
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
    if ( p.isCancel( answer ) ) { p.cancel( 'Cancelled.' ); process.exit( 0 ); }
    outDirRelative = String( answer ).trim();
  }

  const outDir = resolve( process.cwd(), outDirRelative );

  if ( existsSync( outDir ) ) {
    if ( nonInteractive ) {
      console.error( `Error: output directory already exists: ${ outDir }` );
      process.exit( 1 );
    }
  }

  // ---------------------------------------------------------------------------
  // Copy template
  // ---------------------------------------------------------------------------
  const templateDir = join( __dirname, 'templates', String( framework ) );
  const tokens = {
    WARE_NAME:    wareName,
    WARE_SLUG:    wareSlug,
    WARE_AUTHOR:  wareAuthor,
    WARE_DESC:    wareDesc,
    WARE_VERSION: flags.version ? String( flags.version ) : '0.1.0',
  };

  const s = nonInteractive ? null : p.spinner();
  if ( s ) s.start( 'Scaffolding project…' );
  else process.stdout.write( 'Scaffolding project…' );

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

  if ( s ) s.stop( 'Project scaffolded.' );
  else console.log( ' done.' );

  const sbHint = wantStorybook ? '\n  npm run storybook        # open Storybook' : '';
  const nextSteps = [
    `\nYour ware is ready in ./${ outDirRelative }\n`,
    'Next steps:\n',
    `  cd ${ outDirRelative }`,
    '  npm install',
    '  npm run dev              # start Vite dev server',
    `  wp bazaar dev start ${ wareSlug } http://localhost:5173`,
    '                           # link dev server to wp-admin (in another terminal)',
    sbHint,
    '\nWhen ready to ship:',
    '  npm run package          # build + zip → ' + wareSlug + '.wp',
    '  wp bazaar install ' + wareSlug + '.wp',
  ].filter( l => l !== '' ).join( '\n' );

  // ---------------------------------------------------------------------------
  // Next steps
  // ---------------------------------------------------------------------------
  if ( nonInteractive ) {
    console.log( nextSteps );
  } else {
    p.outro( nextSteps );
  }
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
