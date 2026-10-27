import * as React from "react"
import { graphql } from "gatsby"
import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import PostExplorer from "../components/post-explorer"

const BlogIndex = ({ data, location }) => (
  <Layout location={location} title={data.site.siteMetadata.title}>
    <PostExplorer posts={data.allMarkdownRemark.nodes} location={location}>
      <Bio />
    </PostExplorer>
  </Layout>
)

export default BlogIndex
export const Head = () => <Seo title="All posts" />

export const pageQuery = graphql`
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
          date(formatString: "MMMM DD, YYYY")
          title
          description
          category
          tags
        }
      }
    }
  }
`
