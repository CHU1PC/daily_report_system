/**
 * Linear API - Issue Operations
 */

import { LinearIssue, PRIORITY_LABELS } from './types'

interface LinearApiResponse {
  data?: {
    issues?: {
      nodes: Array<{
        id: string
        identifier: string
        title: string
        description?: string
        priority: number
        state: {
          name: string
          type: string
        }
        project?: {
          name: string
        }
        assignee?: {
          name: string
          email: string
        }
        url: string
        createdAt: string
        updatedAt: string
      }>
    }
    viewer?: {
      assignedIssues: {
        nodes: Array<{
          id: string
          identifier: string
          title: string
          description?: string
          priority: number
          state: {
            name: string
            type: string
          }
          project?: {
            name: string
          }
          url: string
          createdAt: string
          updatedAt: string
        }>
      }
    }
  }
  errors?: Array<{
    message: string
  }>
}

/**
 * すべてのLinear Issueを取得（完了済み、キャンセル済み、全てのステータスを含む）
 * ページネーションで全てのIssueを取得し、ステータス順にソートして返す
 */
export async function getAllLinearIssues(apiKey: string): Promise<LinearIssue[]> {
  const allIssues: LinearIssue[] = []
  let hasNextPage = true
  let endCursor: string | null = null
  const pageSize = 100

  while (hasNextPage) {
    const query = `
      query($after: String) {
        issues(
          orderBy: updatedAt
          first: ${pageSize}
          after: $after
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            description
            priority
            state {
              name
              type
            }
            project {
              name
            }
            team {
              id
              name
              key
            }
            assignee {
              name
              email
            }
            url
            createdAt
            updatedAt
          }
        }
      }
    `

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          query,
          variables: { after: endCursor },
        }),
      })

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
      }

      const result: any = await response.json()

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
      }

      if (!result.data?.issues) {
        throw new Error('No data returned from Linear API')
      }

      // データを整形して追加
      const issues = result.data.issues.nodes.map((issue: any) => ({
        ...issue,
        priorityLabel: PRIORITY_LABELS[issue.priority] || 'なし',
      }))

      allIssues.push(...issues)

      // 次のページがあるかチェック
      hasNextPage = result.data.issues.pageInfo.hasNextPage
      endCursor = result.data.issues.pageInfo.endCursor

      console.log(`Fetched ${issues.length} issues (total: ${allIssues.length}, hasNextPage: ${hasNextPage})`)
    } catch (error) {
      console.error('Error fetching Linear issues:', error)
      throw error
    }
  }

  // ステータスの優先順位を定義
  const stateOrder: Record<string, number> = {
    unstarted: 1, // 未終了
    started: 2, // 進行中
    canceled: 3, // キャンセル
    completed: 4, // 完了
  }

  // ステータス順にソート（未終了 → 進行中 → キャンセル → 完了）
  return allIssues.sort((a, b) => {
    const orderA = stateOrder[a.state.type] || 99
    const orderB = stateOrder[b.state.type] || 99
    return orderA - orderB
  })
}

/**
 * 自分にアサインされているLinear Issueを取得
 */
export async function getMyLinearIssues(apiKey: string): Promise<LinearIssue[]> {
  const query = `
    query {
      viewer {
        assignedIssues(
          filter: {
            state: { type: { nin: ["completed", "canceled"] } }
          }
          orderBy: updatedAt
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            state {
              name
              type
            }
            project {
              name
            }
            team {
              id
              name
              key
            }
            url
            createdAt
            updatedAt
          }
        }
      }
    }
  `

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
    }

    const result: LinearApiResponse = await response.json()

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
    }

    if (!result.data?.viewer) {
      throw new Error('No data returned from Linear API')
    }

    // データを整形して返す
    return result.data.viewer.assignedIssues.nodes.map((issue) => ({
      ...issue,
      priorityLabel: PRIORITY_LABELS[issue.priority] || 'なし',
    }))
  } catch (error) {
    console.error('Error fetching Linear issues:', error)
    throw error
  }
}

/**
 * 特定のIssueを取得
 */
export async function getLinearIssue(apiKey: string, issueId: string): Promise<LinearIssue | null> {
  const query = `
    query($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        priority
        state {
          name
          type
        }
        project {
          name
        }
        url
        createdAt
        updatedAt
      }
    }
  `

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query,
        variables: { id: issueId },
      }),
    })

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
    }

    const result: any = await response.json()

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
    }

    if (!result.data?.issue) {
      return null
    }

    return {
      ...result.data.issue,
      priorityLabel: PRIORITY_LABELS[result.data.issue.priority] || 'なし',
    }
  } catch (error) {
    console.error('Error fetching Linear issue:', error)
    throw error
  }
}
