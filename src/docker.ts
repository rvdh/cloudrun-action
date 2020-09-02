import * as core from '@actions/core'
import {ImageApi} from 'docker-client'

export async function getEnvVarsFromImage(
  name: string
): Promise<string[] | undefined> {
  const api = new ImageApi()
  try {
    const image = api.imageInspect(name)
    return (await image).Config?.Env
  } catch (error) {
    core.setFailed(error.message)
  }

  return undefined
}
