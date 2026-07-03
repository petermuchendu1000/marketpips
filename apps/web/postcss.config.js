// PostCSS config — wires Tailwind CSS v3 + Autoprefixer into Next.js's build.
// Without this file Next never processes the `@tailwind base/components/utilities`
// directives in app/globals.css, so NO utility classes or preflight are emitted
// and the entire UI renders unstyled. Tailwind v3 requires this config.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
