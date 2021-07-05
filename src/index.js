import { Signer } from '@waves/signer';
import { ProviderWeb } from '@waves.exchange/provider-web'
import { ProviderSeed } from '@waves/provider-seed'
import { ProviderCloud } from '@waves.exchange/provider-cloud'
import { Waves } from '@waves/ledger/lib/Waves';

const debug = require('debug')('lease-web')

//import { libs } from '@waves/waves-transactions';

require('ccxt/dist/ccxt.browser')

const wavesexchange  = window.ccxt.wavesexchange

const axios = require('axios').default
const lodash = require('lodash')
const moment = require('moment')

const SIGNER_PROVIDERS = {
  web: ProviderWeb,
  seed: ProviderSeed,
  cloud: ProviderCloud
}

//const WXDataService = axios.create({ baseURL: 'https://api.wavesplatform.com/v0' })
const WavesNode = axios.create({ baseURL: 'https://nodes.wavesnodes.com/' })

const BlockChain = {
  height: null,
  heightLastRead: null
}

export class LposCash {
  
  /**
   * 
   * @param {string} opts.provider Can be one of [web, seed, cloud, keeper, ledger] 
   */
  constructor({type, seed}={type: 'keeper', seed:undefined}){

    this.signerType = type==undefined ? 'web' : type  
    this.signer = null
    this.keeper = null

    this.initSigner(seed)

    this.clear()
  }

  clear(){
    this.user = null

    this.balances = {
      allAssets: null,
      userWaves: null,
      serviceWaves: null
    }


    this.clearLeaseCache()
  }

  clearLeaseCache(){
    this.leaseTxns = {
      active: {},
      cancelled: {}
    }

    this.leases = {
      active: [],
      pending: [],
      cancelled: []
    }

    this.leasedTotal = {
      active: 0,
      pending: 0,
      cancelled: 0
    }
  }



  initSigner(seed){

    console.log('initSigner', this.signerType)

    switch(this.signerType){
      case 'web':
      case 'seed':
      case 'cloud':
        this.signer = new Signer()
        let provider = new SIGNER_PROVIDERS[this.signerType](seed)

        this.signer.setProvider(provider)
        break;

      case 'keeper':
        if(!WavesKeeper){
          throw new Error('Waves Keeper not found')
        }

        this.keeper = WavesKeeper
        this.keeper.on('update', this.handleKeeperUpdate.bind(this))
        break;

      case 'ledger':
        break;

    }


  }

  handleKeeperUpdate(state){
    console.log('handleKeeperUpdate', state)
  }

  async login(){

    console.log('login start', this.signerType)

    switch(this.signerType){
      case 'web':
      case 'seed':
      case 'cloud':
        this.user = await this.signer.login()
        break;

      case 'keeper':

        let keeperState = await this.keeper.publicState()

        this.user = keeperState.account
        break;

      case 'ledger':
        break;
    }
    
    await this.update()

    console.log('login complete')
  }

  async logout(){
    await signer.logout()
    this.clear()
  }

  async update(){
    await Promise.all([
      this.updateBalances(),
      this.updateLeaseData()
    ])

    console.log('update', this.balances, this.leases)
  }

  async updateLeaseData(){
    this.clearLeaseCache()

    //await Promise.all([
      //this.getLeaseTxns(),
      //this.getLeaseTxns('cancelled'),
    //])

    //! Use a second source for active txns to ensure we get txns sent to an alias
    const leaseInfo = await LposCash.fetchLeasingActiveTxns(this.user.address)

    this.leases = leaseInfo.leases
    this.leaseTxns = leaseInfo.txns

    //! Filter uniques
    /*this.leases.active = lodash.uniq(this.leases.active)
    this.leases.pending = lodash.uniq(this.leases.pending)
    this.leases.cancelled = lodash.uniq(this.leases.cancelled)

    const filterInactive = [].concat(this.leases.pending).concat(this.leases.cancelled)

    lodash.pullAll(this.leases.active, filterInactive)
    lodash.pullAll(this.leases.pending, this.leases.cancelled)*/

    this.leasedTotal.active = this.sumLeases(this.leases.active)
    this.leasedTotal.pending = this.sumLeases(this.leases.pending)
    //this.leasedTotal.cancelled = this.sumLeases(this.leases.cancelled)
  }

  async updateBalances(){
    let [balancesAllAssets, balancesWaves, balancesService] = await Promise.all([
      LposCash.fetchAssetBalances(this.user.address),
      LposCash.fetchBalanceDetails(this.user.address),
      LposCash.fetchBalanceDetails(LposCash.ServiceAddress)
    ])

    this.balances = {
      allAssets: balancesAllAssets,
      userWaves: balancesWaves,
      serviceWaves: balancesService
    }
  }

  leaseTxn(id){
    return this.leaseTxns[id]
  }

  sumLeases(ids){
    let sum = 0

    ids.map(id=>{
      const txn = this.leaseTxn(id)
      sum+=txn.amount
    })

    return sum
  }

  static async fetchLeasingActiveTxns(address){
    const res = await WavesNode.get('/leasing/active/'+address)

    console.log(res)
    await LposCash.fetchHeight()

    let result = {
      txns: {},
      leases: {
        active: [],
        pending: []
      }
    }

    res.data.map(txn=>{
      result.txns[txn.id] = txn

      if(txn.recipient != LposCash.ServiceAddress && txn.recipient != 'alias:W:' + LposCash.ServiceAlias){
        console.log('lease ignored', txn.id)

        return
      }

      if(BlockChain.height >= (txn.height + 1000)){
        result.leases.active.push(txn.id)
        console.log('lease active', txn.id)
      } else {
        result.leases.pending.push(txn.id)
        console.log('lease pending', txn.id)
      }
    })

    return result
  }

  /*
  async getLeaseTxns(type='active', after){
    let path = '/transactions/lease'
    if(type=='cancelled'){ path += '-cancel' }
    else if(type!='active'){
      throw "Invalid lease transaction type"
    }

    const res = await WXDataService.get(path, {
      params: {
        sender: this.user.address,
        recipient: LposCash.ServiceAddress,
        sort: 'desc',
        limit: 100,
        after
      }
    })


    if(res.status == 200){

      const transactions = res.data.data
      await LposCash.fetchHeight()

      transactions.map(txn=>{
        
        if(type == 'cancelled'){ 
          this.leaseTxns[type][txn.data.leaseId] = txn.data
          this.leases.cancelled.push(txn.data.leaseId)

          //console.log('lease cancel', txn.data.leaseId)
        }
        else if(type == 'active'){
          this.leaseTxns[type][txn.data.id] = txn.data

          if(BlockChain.height >= (txn.data.height + 1000)){
            this.leases.active.push(txn.data.id)
            //console.log('lease active', txn.data.id)
          } else {
            this.leases.pending.push(txn.data.id)
            //console.log('lease pending', txn.data.id)
          }
        }
      })

      if(!res.data.isLastPage){
        const lastCursor = res.data.lastCursor
        //console.warn('Downloading next page', lastCursor)

        return await this.getLeaseTxns(type, lastCursor)
      }
    }
  }*/

  static async fetchHeight(){
    const now = new moment()

    //! Rate limit lookup
    if(BlockChain.heightLastRead != null){
      const deltaMs = now.diff(BlockChain.heightLastRead)
      if(deltaMs < 1000 * 25){ return }
    }

    const res = await WavesNode.get('blocks/height')
    BlockChain.height = res.data.height
    BlockChain.heightLastRead = now
  }

  static async fetchBalanceDetails(address){
    const res = await WavesNode.get('/addresses/balance/details/'+address)

    return res.data
  }

  static async fetchAssetBalances(address){
    const res = await WavesNode.get('/assets/balance/'+address)

    return res.data
  }

  static async fetchAssetDetails(assetIds){
    const ids = '?' + assetIds.map(id=>{return 'id='+id}).join('&')
    const res = await WavesNode.get('/assets/details'+ids)

    return res.data
  }

  static async fetchTransactions(address, limit=1000, after){
    const afterStr = !after ? '' : '?after='+after
    const res = await WavesNode.get('/transactions/address/'+address+'/limit/'+limit+afterStr)

    return res.data
  }

  async requestLease(amount){
    const tx = await this.signer.lease({
      amount,
      recipient: 'alias:W:'+LposCash.ServiceAlias
    })
    .broadcast()

    console.log(tx)
  }

  static get ServiceAddress(){
    return '3PPkQ1ZD68dTqWMbCcTF1XpP1MWYd9u9kdH'
  }

  static get ServiceAlias(){
    return 'lposcash'
  }
}

export class Exchange {

  constructor(){
    this.we = new wavesexchange({
      apiKey: localStorage['WAVES_PUBLIC_KEY'],
      secret: localStorage['WAVES_PRIVATE_KEY'],
      timeout: 30000
    });

    this.we.urls.api.matcher="https://matcher.waves.exchange"

    this.balances = null
  }

  async start(){
    console.log('loading markets')
    await this.we.loadMarkets();

    const currencies = this.we.currencies; // Dictionary of currencies

    const symbols = this.we.symbols; // Dictionary of trading pairs

    const wavesUsdn = this.we.markets['WAVES/USDN']; // Get market structure by symbol

    console.log('currencies', Object.keys(currencies))
    console.log('symbols', symbols)

    this.balances = await this.we.fetchBalance()
    await this.loadOrders()

  }

  async loadOrders(){
    console.log('loading account')

    const [orders, closed, trades] = await Promise.all([
      await this.we.fetchOpenOrders('WAVES/USDN'),
      await this.we.fetchClosedOrders('WAVES/USDN'),
      await this.we.fetchMyTrades('WAVES/USDN')
    ])

    
    console.log('got open orders', orders)
    
    console.log('got closed oders', closed)
    
    console.log('got trades', trades)

  }

  static async demo(){

    let e = new Exchange()

    await e.start()

    console.log('started')

    setInterval(async ()=>{
      console.log('interval')
      await e.loadOrders()
    }, 30000)
  }
}
