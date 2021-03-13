import { Signer } from '@waves/signer';
import { ProviderWeb } from '@waves.exchange/provider-web'

const axios = require('axios').default
const lodash = require('lodash')
const moment = require('moment')

const WXDataService = axios.create({ baseURL: 'https://api.wavesplatform.com/v0' })
const WavesNode = axios.create({ baseURL: 'https://nodes.wavesnodes.com/' })

export class LposCash {
  constructor(){
    this.signer = new Signer()
    this.signer.setProvider(new ProviderWeb())

    this.clear()
  }

  clear(){
    this.user = null

    this.balances = {
      allAssets: null,
      userWaves: null,
      serviceWaves: null
    }

    this.height = null
    this.heightLastRead = null

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

  async login(){
    this.user = await this.signer.login()
    
    await Promise.all([
      this.updateBalances(),
      this.updateLeaseData()
    ])

    console.log('login complete')
  }

  async logout(){
    await signer.logout()
    this.clear()
  }

  async updateLeaseData(){
    this.clearLeaseCache()

    await Promise.all([
      this.getLeaseTxns(),
      this.getLeaseTxns('cancelled')
    ])

    const filterInactive = [].concat(this.leases.pending).concat(this.leases.cancelled)

    lodash.pullAll(this.leases.active, filterInactive)
    lodash.pullAll(this.leases.pending, this.leases.cancelled)

    this.leasedTotal.active = this.sumLeases(this.leases.active)
    this.leasedTotal.pending = this.sumLeases(this.leases.pending)
    this.leasedTotal.cancelled = this.sumLeases(this.leases.cancelled)
  }

  async updateBalances(){
    let [balancesAllAssets, balancesWaves, balancesService] = await Promise.all([
      this.signer.getBalance(),
      this.getBalanceDetails(this.user.address),
      this.getBalanceDetails(LposCash.ServiceAddress)
    ])

    this.balances = {
      allAssets: balancesAllAssets,
      userWaves: balancesWaves,
      serviceWaves: balancesService
    }
  }

  leaseTxn(id){
    return this.leaseTxns.active[id]
  }

  sumLeases(ids){
    let sum = 0

    ids.map(id=>{
      const txn = this.leaseTxn(id)
      sum+=txn.data.amount
    })

    return sum
  }

  async getLeasingActive(address){
    const res = await WavesNode.get('/leasing/active/'+address)

    res.data.map(txn=>{
      this.
    })

  }

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
      await this.getHeight()

      transactions.map(txn=>{
        
        if(type == 'cancelled'){ 
          this.leaseTxns[type][txn.data.leaseId] = txn
          this.leases.cancelled.push(txn.data.leaseId)

          //console.log('lease cancel', txn.data.leaseId)
        }
        else if(type == 'active'){
          this.leaseTxns[type][txn.data.id] = txn

          if(this.height >= (txn.data.height + 1000)){
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
  }

  async getHeight(){
    const now = new moment()

    //! Rate limit lookup
    if(this.heightLastRead != null){
      const deltaMs = now.diff(this.heightLastRead)
      if(deltaMs < 1000 * 25){ return }
    }

    const res = await WavesNode.get('blocks/height')
    this.height = res.data.height
    this.heightLastRead = now
  }

  async getBalanceDetails(address){
    const res = await WavesNode.get('/addresses/balance/details/'+address)

    return res.data
  }

  async requestLease(amount){
    const tx = await this.signer.lease({
      amount: Math.pow(10, 8) * amount,
      //recipient: 'alias:T:'+LposCash.ServiceAlias
      recipient: LposCash.ServiceAddress
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