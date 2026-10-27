// custom typefaces
import "@fontsource-variable/montserrat"
import "@fontsource/merriweather"
// normalize CSS across browsers
import "./src/normalize.css"
// custom CSS styles
import "./src/style.css"

// Highlighting for code blocks
import "prismjs/themes/prism.css"

import "katex/dist/katex.min.css"
// Keep the archive in place while selecting categories or tags.
export const shouldUpdateScroll = ({ prevRouterProps, routerProps }) => {
  if (
    prevRouterProps?.location.pathname === routerProps.location.pathname &&
    routerProps.location.state?.filterNavigation
  )
    return false
  return true
}
