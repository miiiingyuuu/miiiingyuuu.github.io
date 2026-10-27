import * as React from "react"
import { graphql } from "gatsby"
import Layout from "../components/layout"
import Seo from "../components/seo"
import PostExplorer from "../components/post-explorer"

const CategoryTemplate = ({ data, pageContext, location }) => (
  <Layout location={location} title={data.site.siteMetadata.title}>
    <PostExplorer
      posts={data.allMarkdownRemark.nodes}
      location={location}
      initialCategory={pageContext.category || ""}
      initialTag={pageContext.tag || ""}
    />
  </Layout>
)

export const Head = ({ pageContext }) => (
  <Seo title={pageContext.tag || pageContext.category || "All posts"} />
)

export const query = graphql`
  {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      nodes {
        excerpt
        fields {
          slug
        }
        frontmatter {
          title
          description
          date(formatString: "MMMM DD, YYYY")
          category
          tags
        }
      }
    }
  }
`

export default CategoryTemplate
