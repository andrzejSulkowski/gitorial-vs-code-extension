import { TutorialId } from '@shared/types';
import { GlobalState, IDB } from './GlobalState';


interface AutoOpenStateData {
  timestamp: number;
  tutorialId: TutorialId;
}


export class AutoOpenState {
  private _db: IDB;
  private key = "auto-open";

  constructor(globalDB: GlobalState){
    this._db = globalDB.getDB("auto-open-db");
  }

  public async set(data: AutoOpenStateData | null){
    await this._db.update(this.key, data);
  }
  public get(): AutoOpenStateData | null {
    return this._db.get<AutoOpenStateData | undefined>(this.key) ?? null;
  }
  public async clear(){
    await this._db.clear(this.key);
  }
}

