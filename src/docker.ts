import * as core from '@actions/core'

export async function getEnvVarsFromImage(
  name: string
): Promise<string[] | undefined> {
  const serviceAccountKey: string = core.getInput('service_account_key', {
    required: true
  })

  const imageUrl = new URL(`https://${name}`)

  const auth = {
    username: '_json_key',
    password: serviceAccountKey,
    auth: '',
    email: '',
    serveraddress: imageUrl.host
  }
  const authData = Buffer.from(JSON.stringify(auth)).toString('base64')

  const got = require('got')

  try {
    core.debug(`Sending pull image command for ${name}`)
    const image = await got.post(
      `unix:/var/run/docker.sock:/images/create?fromSrc=${name}`,
      {headers: {'X-Registry-Auth': authData}}
    )
    core.debug(`image = ${image}`)
    //const imageInspect = image.inspect()
    //core.info(JSON.stringify(imageInspect, null, 4))
    core.info(JSON.stringify(image, null, 4))
    return image
  } catch (error) {
    core.setFailed(error.message)
  }

  return undefined
}
