const datapay = require('datapay')
const uuid = require('uuid')
const _ = require('lodash')
const EventSource = require('eventsource')
const configs = require('../configs.json')
const oraclePrivate = configs.oraclePrivate
const oraclePublic = configs.oraclePublic

if (!oraclePrivate) throw new Error('configs.oraclePrivate is required')
if (!oraclePublic) throw new Error('configs.oraclePublic is required')

// collection of games
const games = {}

// create a new game
const createGame = (playerId, size) => ({
  playerId,
  gameId: uuid(),
  pkey: uuid(), // used to encrypt initialstate
  size,
  gamestate: _.shuffle(_.range(0, size).map(i => ({ id: i % (size / 2) })))
    .map((card, index) => ({
      index,
      id: card.id,
      isPaired: false
    })),
  isFinished: false,
  prevCard: null
})

const startGame = (playerId) => {
  const game = createGame(playerId, 9 * 2)
  const publishedGame = Object.assign({}, game)
  // TODO encrypt gamestate
  delete publishedGame.pkey
  // publishedGame.gameState = publishedGame.gameState // TODO encrypt state

  // publish the initial game state
  // the shuffled cards are encrypted with a private key
  // which can be verified once the game finishes
  datapay.send({
    data: [
      oraclePublic,
      game.playerId,
      'startgame', // event
      game.gameId,
      String(game.size),
      JSON.stringify(publishedGame) // TODO encrypt game state
    ],
    pay: {
      key: oraclePrivate,
      rpc: 'https://api.bitindex.network',
      fee: 5000
    }
  }, (err, tx) => {
    if (err) throw err
    games[game.gameId] = game
    console.log('startGame', tx)
    console.log(game)
  })
}

const endGame = (gameId) => {
  const game = games[gameId]
  if (!game) return
  game.isFinished = true

  datapay.send({
    data: [
      oraclePublic,
      game.playerId,
      'endgame', // event
      JSON.stringify(game)
    ],
    pay: {
      key: oraclePrivate,
      rpc: 'https://api.bitindex.network',
      fee: 5000
    }
  }, (err, tx) => {
    if (err) throw err
    console.log('endGame', tx)
  })
}

const play = (gameId, playerId, index) => {
  const game = games[gameId]
  if (!game) {
    console.error('unkown game', gameId)
    return
  }
  if (game.playerId !== playerId) {
    console.error('wrong game user', playerId, gameId)
  }

  const card = game.gamestate[index]
  const prevCard = game.prevCard
  if (!card) {
    console.error('invalid card index', gameId, playerId, index, game)
    return
  }

  let foundPair = false
  if (prevCard && prevCard.index !== card.index && prevCard.id === card.id) {
    // user found pair
    prevCard.isPaired = true
    card.isPaired = true
    game.prevCard = null
    foundPair = true
  } else {
    game.prevCard = prevCard ? null : card
  }

  const gamestate = {
    pairs: game.gamestate.filter(card => card.isPaired),
    card,
    prevCard
  }

  const pay = {
    key: oraclePrivate,
    rpc: 'https://api.bitindex.network',
    fee: 5000
  }

  if (foundPair) {
    pay.to = [{
      address: game.playerId,
      value: 5000
    }]
  }

  // broadcast the visible gamestate (pairs + lastcard + userflipped)
  datapay.send({
    data: [
      oraclePublic,
      game.playerId,
      'play', // event
      game.gameId,
      JSON.stringify(gamestate)
    ],
    pay
  }, (err, tx) => {
    console.log('play', tx)
    if (err) throw err
    console.log(gamestate)
  })

  if (gamestate.pairs.length === game.size) {
    endGame(game.gameId)
  }
}

console.log('oracle started')

const query = { v: 3, q: { 'find': { 'out.e.a': oraclePublic } } }
const req = Buffer.from(JSON.stringify(query)).toString('base64')
const socket = new EventSource('https://genesis.bitdb.network/s/1FnauZ9aUH2Bex6JzdcV4eNX7oLSSEbxtN/' + req)
socket.addEventListener('message', (e) => {
  const raw = JSON.parse(e.data)
  if (raw.type === 'u') {
    let opreturn
    try {
      // filter transactions comming from money button
      opreturn = JSON.parse(raw.data[0].out[0].s4)
    } catch (e) {
      return
    }

    const event = opreturn.event
    console.log('event:', event)

    if (event === 'startgame') {
      const userId = opreturn.userId
      if (!userId) {
        throw new Error('userId is required')
      }
      startGame(userId)
    }

    if (event === 'play') {
      console.log(opreturn)
      play(opreturn.gameId, opreturn.userId, opreturn.index)
    }
  }
})
