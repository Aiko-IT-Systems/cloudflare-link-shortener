# AITSYS Go icon source

`aitsys-go-cat-link.svg` is the canonical full-colour mark: a pink cat face with
interlocking-link eyes. All production icon formats should be exported from that
file, rather than redrawn independently.

`aitsys-go-cat-link-monochrome.svg` is the deliberately simplified, one-colour
version for platform tinting and themed Android icons.

The current checked-in exports are:

- `src/worker/public/logo.png` and `src/worker/public/favicon.png` for the
  Worker defaults;
- `src/worker/public/favicon.ico` for conventional favicon consumers;
- `src/extensions/static/*/icons/icon.svg` for Chrome, Edge, and Firefox;
- `src/android/app/src/main/res/drawable/ic_launcher_foreground.xml` for Android's
  adaptive and monochrome launcher icon.

Keep the mark text-free, retain its dark `#12051A` backdrop in full-colour app
icons, and test future revisions at 16 px before replacing these files.
