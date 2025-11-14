/**
 * Linear API - Team Operations
 */

import { LinearTeam } from './types'

/**
 * すべてのLinear Teamを取得
 */
export async function getAllLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const query = `
    query {
      teams(first: 100) {
        nodes {
          id
          name
          key
          description
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
      body: JSON.stringify({ query }),
    })

    const result: any = await response.json()

    if (!response.ok) {
      console.error('Linear API error response:', result)
      throw new Error(`Linear API error: ${response.status} ${response.statusText} - ${JSON.stringify(result)}`)
    }

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
    }

    if (!result.data?.teams) {
      throw new Error('No data returned from Linear API')
    }

    // URLを生成、icon/colorはnullで設定（Linear APIはこれらのフィールドをTeamに持たない）
    return result.data.teams.nodes.map((team: any) => ({
      ...team,
      icon: null,
      color: null,
      url: `https://linear.app/team/${team.key}`,
    }))
  } catch (error) {
    console.error('Error fetching Linear teams:', error)
    throw error
  }
}
