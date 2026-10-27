import * as React from "react"
import { Link, navigate } from "gatsby"
import taxonomy from "../data/taxonomy.json"

const PostExplorer = ({
  posts,
  location,
  initialCategory = "",
  initialTag = "",
  children,
}) => {
  const [search, setSearch] = React.useState("")
  React.useEffect(() => setSearch(location.search || ""), [location.search])
  const params = new URLSearchParams(search)
  const requestedCategory = params.has("category")
    ? params.get("category")
    : initialCategory
  const category =
    taxonomy.categories.find(item => item.name === requestedCategory)?.name ||
    ""
  const requestedTag = params.has("tag")
    ? params.get("tag")
    : params.has("category")
    ? ""
    : initialTag
  const categoryPosts = posts.filter(
    post => !category || post.frontmatter.category?.includes(category)
  )
  const tagCounts = new Map()
  categoryPosts.forEach(post =>
    new Set(post.frontmatter.tags || []).forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    })
  )
  const tag = tagCounts.has(requestedTag) ? requestedTag : ""
  const tags = [...tagCounts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )
  const visiblePosts = categoryPosts.filter(
    post => !tag || post.frontmatter.tags?.includes(tag)
  )

  const select = (nextCategory = "", nextTag = "") => {
    const query = new URLSearchParams()
    query.set("category", nextCategory)
    if (nextTag) query.set("tag", nextTag)
    navigate(`${location.pathname}?${query.toString()}`, {
      state: { filterNavigation: true },
    })
  }

  return (
    <>
      <nav className="category-navigation" aria-label="카테고리">
        <div className="category-links">
          {taxonomy.categories.map(item => {
            const count = posts.filter(post =>
              post.frontmatter.category?.includes(item.name)
            ).length
            const expanded = category === item.name
            return (
              <button
                key={item.name}
                type="button"
                id={`topic-${item.name}`}
                className="category-link"
                aria-expanded={expanded}
                aria-controls="category-tags"
                onClick={() => select(expanded ? "" : item.name)}
              >
                {item.name} ({count})
              </button>
            )
          })}
        </div>
        <div
          id="category-tags"
          className="category-tags"
          hidden={!category}
          role="region"
          aria-label={category ? `${category} 하위 태그` : "하위 태그"}
        >
          {category && (
            <>
              <span className="category-tags-label">{category}:</span>
              {tags.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className="category-link tag-link"
                  aria-pressed={tag === name}
                  onClick={() => select(category, tag === name ? "" : name)}
                >
                  #{name} ({count})
                </button>
              ))}
            </>
          )}
        </div>
        <p
          className="category-filter-status"
          aria-live="polite"
          aria-atomic="true"
          hidden={!tag}
        >
          {category || "전체"} / #{tag} · {visiblePosts.length}개의 글
        </p>
      </nav>

      {children}
      <ol style={{ listStyle: "none" }}>
        {visiblePosts.map(post => (
          <li key={post.fields.slug}>
            <article
              className="post-list-item"
              itemScope
              itemType="http://schema.org/Article"
            >
              <header>
                <h2>
                  <Link to={post.fields.slug} itemProp="url">
                    <span itemProp="headline">
                      {post.frontmatter.title || post.fields.slug}
                    </span>
                  </Link>
                </h2>
                <small>{post.frontmatter.date}</small>
              </header>
              <section>
                <p
                  dangerouslySetInnerHTML={{
                    __html: post.frontmatter.description || post.excerpt,
                  }}
                />
              </section>
            </article>
          </li>
        ))}
      </ol>
      {visiblePosts.length === 0 && <p>이 조건에 해당하는 글이 없습니다.</p>}
    </>
  )
}

export default PostExplorer
