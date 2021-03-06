import {Utils} from "../utils/utils";
import {arweave, db} from "../app";
import {ILink} from "../interfaces/iLink";
import $ from 'cash-dom';
import { VotesModel } from "./mVotes";

export class LinksModel {
  private threads = 8;
  private tableName = 'links';
  private cacheLinks = new Map<string, any>();

  constructor(threads = 8, dbTableName = 'links') {
    this.threads = threads;
    this.tableName = dbTableName;
  }

  async init() {
    await this.getAllSaved();
    return true;
  }

  private async getAllSaved(): Promise<boolean> {
    const data = await db.find(this.tableName);
    this.cacheLinks = await Utils.createDataById(data);

    return true;
  }

  async sortByVotes(data) {
    return data.sort((a, b) => a.votes.length < b.votes.length? 1 : a.votes.length > b.votes.length? -1 : 0);
  }

  async convertAllToHtml(data) {
    const {dataById, categories} = data;
    const _categories = new Map();

    const baseUrl = `${arweave.api.config.protocol}://${arweave.api.config.host}:${arweave.api.config.port}`;

    let html = '';

    dataById.forEach(async link => {
      const isCategory = categories.findIndex(l => l.toLowerCase() === link.category.toLowerCase());
      if(isCategory === -1) {
        return true;
      }

      let collection = '';
      if(_categories.has(link.category)) {
        collection = _categories.get(link.category);
      } else {
        const gradient = Utils.gradients[isCategory] || (Utils.gradients[Math.random() * Utils.gradients.length]);
        collection = `<div data-category="${link.category}" class="col s12"><h5 class="white-text" style="${gradient}; margin: 0; margin-bottom: -7px; padding: 15px 10px;">${link.category.toUpperCase()}</h5><ul class="collection">`;
      }
      const img = '<img class="empty-img" />';

      collection += `
                    <li class="collection-item avatar" data-id="${link.id}" data-linkid="${link.linkId}" data-repository="${Utils.toSlug(link.title)}">
                        <div class="secondary-content center-align">
                            <a href="#" class="js-vote material-icons">arrow_drop_up</a>
                            <span class="app-votes">${link.votes.length}</span>
                        </div>
                    
                        <a href="${baseUrl}/${link.linkId}" target="_blank" rel="nofollow" class="js-addy-link">
                            ${img}
                            <div class="title">${link.title}</div>
                            <small>${link.description}</small>
                        </a>
                    </li>`;

      _categories.set(link.category, collection);
    });

    const catsData = Array.from(_categories);

    console.log(catsData);

    catsData.sort((a, b) => a[0].toLowerCase() > b[0].toLowerCase()? 1 : a[0].toLowerCase() < b[0].toLowerCase()? -1 : 0);
    catsData.forEach(cat => {
      html += `${cat[1]}</ul></div>`;
    });

    return html;
  }

  async getTransactionDetails(transactions: string[]): Promise<ILink[]> {
    return new Promise(resolve => {
      const total = transactions.length;
      const toLoad = total > this.threads ? this.threads : total;
      let current = 0;
      let loaded = 0;
      let data = [];

      const go = async(index) => {
        if(total === index) {
          return;
        }

        const id = transactions[index];
        try {
          const txRow = await this.getTransactionDetailsById(id);
          data.push(txRow);
        } catch (e) {
          console.log(e);
        }

        $('.jsLinksLoaded').text(` ${++loaded}/${total}`);
        if(current === total) {
          return resolve(data);
        }
        return go(++current);
      };

      current = toLoad;
      for(let i = 0; i < toLoad; i++) {
        go(i).catch(console.log);
      }
    });
  }

  async getTransactionDetailsById(txId: string): Promise<ILink> {
    let txRow:ILink = this.cacheLinks.get(txId);

    if(txRow) {
      const votesModel = new VotesModel();
      txRow.votes = await votesModel.getVotesByLinkId(txId);

      db.upsert(this.tableName, txRow, txId).catch(console.log);
      this.cacheLinks.set(txId, txRow);
      return txRow;
    }
    // @ts-ignore
    txRow = {};

    const res = await arweave.api.get(`/tx/${txId}`);
    const tx = res.data;

    const data = JSON.parse(atob(tx.data));

    txRow['title'] = Utils.stripTags(data.title);
    txRow['id'] = txId;
    txRow['appIcon'] = data.appIcon? Utils.stripTags(data.appIcon) : null;
    txRow['from'] = await arweave.wallets.ownerToAddress(tx.owner);
    txRow['fromUser'] = txRow['from'];
    txRow['linkId'] = data.linkId? Utils.stripTags(data.linkId) : null;
    txRow['description'] = Utils.stripTags(data.description);

    tx.tags.forEach(tag => {
      const key = Utils.stripTags(atob(tag.name));
      txRow[key.toLowerCase().replace(/-([a-z])/g, (g) => g[1].toUpperCase())] = Utils.stripTags(atob(tag.value));
    });

    const votesModel = new VotesModel();
    txRow.votes = await votesModel.getVotesByLinkId(txId);

    db.upsert(this.tableName, txRow, txId).catch(console.log);

    return txRow;
  }

  async getTransaction(txId: string): Promise<any> {
    let result = this.cacheLinks.get(txId);

    if(result) {
      return result;
    }
    result = {};

    try {
      console.log(`Checking tx ${txId}`);
      const res = await arweave.api.get(`/tx/${txId}`);
      const tx = res.data;

      result = tx;

      tx.tags.forEach(tag => {
        const key = Utils.stripTags(atob(tag.name));
        result[key.toLowerCase().replace(/-([a-z])/g, (g) => g[1].toUpperCase())] = Utils.stripTags(atob(tag.value));
      });
    } catch(e) {
      console.log(`Error getting tx tags requests for ${txId}`);
    }

    db.upsert(this.tableName, result, txId).catch(console.log);

    return result;
  }
}