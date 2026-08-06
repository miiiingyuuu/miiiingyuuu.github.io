import * as React from "react"

const getPreferredTheme = () => {
  if (typeof window === "undefined") return "light"

  const savedTheme = window.localStorage.getItem("theme")
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? ""
    : "light"
}

const ThemeToggle = () => {
  const [theme, setTheme] = React.useState("light")

  React.useEffect(() => {
    setTheme(document.documentElement.dataset.theme || getPreferredTheme())
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark"

    document.documentElement.dataset.theme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
    window.localStorage.setItem("theme", nextTheme)
    setTheme(nextTheme)
  }

  const isDark = theme === "dark"

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`${isDark ? "라이트" : "다크"} 모드로 전환`}
      title={`${isDark ? "라이트" : "다크"} 모드로 전환`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? "☾" : "☀︎"}
      </span>
    </button>
  )
}

export default ThemeToggle
