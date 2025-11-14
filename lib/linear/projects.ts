/**
 * Linear API - Project Operations
 */

import { LinearProject } from './types'

/**
 * すべてのLinear Projectを取得（Team情報を含む）
 */
export async function getAllLinearProjects(apiKey: string): Promise<LinearProject[]> {
  const query = `
    query {
      projects(
        first: 100
        orderBy: updatedAt
      ) {
        nodes {
          id
          name
          description
          icon
          color
          state
          startDate
          targetDate
          url
          createdAt
          updatedAt
          teams {
            nodes {
              id
              name
              key
            }
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

    const result: any = await response.json()

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
    }

    if (!result.data?.projects) {
      throw new Error('No data returned from Linear API')
    }

    // Projectを整形して、最初のTeamを紐付ける
    return result.data.projects.nodes.map((project: any) => ({
      ...project,
      team: project.teams?.nodes?.[0] || undefined,
      teams: undefined, // teamsフィールドは除外
    }))
  } catch (error) {
    console.error('Error fetching Linear projects:', error)
    throw error
  }
}

/**
 * 特定のTeamのProjectを取得
 */
export async function getLinearProjectsByTeam(apiKey: string, teamId: string): Promise<LinearProject[]> {
  const query = `
    query($teamId: String!) {
      team(id: $teamId) {
        projects(first: 100) {
          nodes {
            id
            name
            description
            icon
            color
            state
            startDate
            targetDate
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
      body: JSON.stringify({
        query,
        variables: { teamId },
      }),
    })

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
    }

    const result: any = await response.json()

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`)
    }

    if (!result.data?.team?.projects) {
      return []
    }

    return result.data.team.projects.nodes.map((project: any) => ({
      ...project,
      team: {
        id: teamId,
        name: result.data.team.name,
        key: result.data.team.key,
      },
    }))
  } catch (error) {
    console.error('Error fetching Linear projects by team:', error)
    throw error
  }
}
