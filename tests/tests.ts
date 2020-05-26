// @ts-ignore
import chime from 'url:./chime_48.m4a'
// @ts-ignore
import mainMusic from 'url:./sample_48.m4a'

import Borilla from '../src/index'

const opts = {
  audioUrls: { mainMusic, chime },
  fetchLimit: Infinity,
}

;(async () => {

  const borilla = new Borilla(opts)
  await borilla.initialize()

  console.log(borilla)

  // @ts-ignore
  window.borilla = borilla

  document.getElementById('chime')?.addEventListener('click', () => {
    borilla.play('chime')
  })

  document.getElementById('chime-50')?.addEventListener('click', async () => {
    const values = await Promise.all(
      new Array(50).fill(undefined).map(() => (
        new Promise(
          (res) => {
            const id = borilla.play('chime')
            res(id)
          }
        )
      ))
    )
    console.log(values)
  })

  document.getElementById('main-music')?.addEventListener('click', () => {
    borilla.play('mainMusic', true)
  })


})()
