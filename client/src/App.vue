<template>
  <div id="app">
    <div class="container">
      <div v-if="!game.id" class="board-overlay" style="padding-top: 100px;">
          <img src="/BSVnode_hero_logo.png" style="width: 50%">
          <h1 v-if="isGameover">GAME OVER - YOU WIN!!</h1>
          <h1>Welcome to SVPairs</h1>
          <h4>Earn cash playing pairs, when a match is found you'll get a reward.</h4>
          <h4>Use your clairvoyant gifts to beat this game and become supreme cards pairing overlord.</h4>
          <p>Swipe MoneyButton to start playing</p>
         <MoneyButton
          label="New Game"
          :to="oraclePublic"
          :opReturn="JSON.stringify({ userId: receiveAddress, event: 'startgame' })"
          amount="0.001"
          currency="USD"
          successMessage="Loading ....."
          style="padding-left: 70px"
        />
      </div>
      <div v-for="n in game.size" class="card" :key="'card'+n" style="">
        <div class="card">
          <img v-if="visibleCard(n)" :src="`/card-${visibleCard(n).id}.png`" style="width: 100%; height: 100%">
          <img v-if="!visibleCard(n)" src="/card-back.png" alt="" style="width: 100%; height: 100%">
          <div v-if="game.started && !visibleCard(n) && game.started" class="card-mbutton">
            <MoneyButton
              label=""
              :to="oraclePublic"
              :opReturn="JSON.stringify({
                userId: receiveAddress,
                event: 'play',
                index: n - 1,
                gameId: game.id
              })"
              amount="0.001"
              currency="USD"
              successMessage="..."
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import MoneyButton from 'vue-money-button'
import axios from 'axios'
import configs from '../../configs.json'

if (!configs.oraclePrivate) throw new Error('configs.oraclePrivate is required')
if (!configs.oraclePublic) throw new Error('configs.oraclePublic is required')
if (!configs.receiveAddress) throw new Error('configs.receiveAddress is required')

export default {
  name: 'app',

  components: {
    MoneyButton
  },

  data () {
    return {
      isGameover: false,
      oraclePublic: configs.oraclePublic,
      receiveAddress: '',
      game: {
        started: false,
        id: null,
        size: 18,
        state: null
      }
    }
  },

  mounted () {
    // TODO user input for receive wallet
    this.setReceiveAddress(configs.receiveAddress)
  },

  methods: {
    visibleCard (index) {
      if (!this.game.state) return false
      index = index - 1
      const card = this.game.state.card
      const prevCard = this.game.state.prevCard

      return (this.game.state.pairs.find(c => c.index === index)) ||
        (prevCard && prevCard.index === index && prevCard) ||
        (card && card.index === index && card)
    },
    getCardImage (index) {
      const card = this.visibleCard(index)
      const file = `./assets/card-${card.id}.png`
      return card && require(file)
    },
    setReceiveAddress (address) {
      this.receiveAddress = address

      // listen to oracle txs to this user
      const query = { v: 3,
        q: { 'find': { '$and': [
          { 'out.s1': this.oraclePublic },
          { 'out.s2': this.receiveAddress }
        ] } } }

      const b64 = btoa(JSON.stringify(query))
      const socket = new EventSource('https://genesis.bitdb.network/s/1FnauZ9aUH2Bex6JzdcV4eNX7oLSSEbxtN/' + b64)

      socket.onmessage = e => {
        const raw = JSON.parse(e.data)
        if (raw.type === 'u') {
          const data = raw.data[0].out[0]
          const event = data.s3

          if (event === 'startgame') {
            this.game.id = data.s4
            this.game.size = parseInt(data.s5)
            this.game.started = true
          } else
          if (event === 'play' && data.s4 === this.game.id) {
            // get gamestate (long data not included in bitsocket)

            const query = { v: 3, q: { 'find': { 'tx.h': raw.data[0].tx.h } } }
            const b64 = btoa(JSON.stringify(query))
            axios
              .get('https://genesis.bitdb.network/q/1FnauZ9aUH2Bex6JzdcV4eNX7oLSSEbxtN/' + b64, {
                headers: { key: 'qpne29ue8chsv9pxv653zxdhjn45umm4esyds75nx6' }
              })
              .then(res => {
                let gamestate
                try {
                  gamestate = JSON.parse(res.data.u[0].out[0].s5)
                } catch (e) {
                  console.error('failed to get gamestate', query, res)
                  throw e
                }
                this.game.state = gamestate
              })
              .catch(err => {
                throw err
              })
          } else
          if (event === 'endgame' && data.s4 === this.game.id) {
            this.isGameover = true
            this.game.id = null
            this.game.started = false
            this.game.state = null
          }
        }
      }
    }
  }
}
</script>

<style>
body {
  background-color: lightgreen;
}
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
.center {
  margin-left: auto;
  margin-right: auto
}
.container {
  display: flex;
  width: 1100px;
  flex-direction: row;
  flex-wrap: wrap;
  /* background-color: lightgreen; */
  border-radius: 20px;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 20px
}
.card {
  width: 180px;
  height: 220px;
  position: relative;
}
.board-overlay {
  position: absolute;
  width: 1100px;
  height: 560px;
  border-radius: 20px;
  z-index: 200;
  background-color: rgba(255,255,255,0.9)
}
.card-mbutton {
  z-index: 100;
  position: absolute;
  left: 25px;
  bottom: 25px;
}
</style>
