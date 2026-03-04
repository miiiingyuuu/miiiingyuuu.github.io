import React from "react"
import { Link, graphql } from "gatsby"
import Layout from "../components/layout"
import Seo from "../components/seo"

const CategoryTemplate = ({ data, pageContext, location }) => {
  const posts = data.allMarkdownRemark.nodes
  const { category } = pageContext

  return (
    <Layout location={location} title={category}>
      <Seo title={`Category: ${category}`} />
      <h1>{category}</h1>
      <p>{posts.length}개의 글</p>
      <ol style={{ listStyle: "none" }}>
        {posts.map(post => (
          <li key={post.fields.slug}>
            <article>
              <h2>
                <Link to={post.fields.slug}>
                  {post.frontmatter.title}
                </Link>
              </h2>
              <small>{post.frontmatter.date}</small>
              <p>{post.excerpt}</p>
            </article>
          </li>
        ))}
      </ol>
    </Layout>
  )
}

export const query = graphql`
  query($category: String!) {
    allMarkdownRemark(
      filter: { frontmatter: { category: { in: [$category] } } }
      sort: { frontmatter: { date: DESC } }
    ) {
      nodes {
        excerpt
        fields {
          slug
        }
        frontmatter {
          title
          date(formatString: "MMMM DD, YYYY")
        }
      }
    }
  }
`

export default CategoryTemplate