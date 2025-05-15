import * as T from "@shared/types";

interface IDB {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: any): Promise<void>;
  clear(key: string): Promise<void>;
}


class GlobalState {
  private _db: IDB;

  constructor(db: IDB) {
    this._db = db;
  }

  public pendingOpenPath = {
    get: (): string | null => {
      return this._db.get<string>("gitorial:pendingOpenPath") ?? null;
    },
    set: async (fsPath: string | undefined): Promise<void> => {
      await this._db.update("gitorial:pendingOpenPath", fsPath);
    }
  };

  public step = {
    get: (id: T.TutorialId): number | string => {
      return this._db.get<number>(`gitorial:${id}:step`, 0);
    },
    /**
     * @param id - The tutorial ID
     * @param step - The step index or commit hash
     */
    set: async (id: T.TutorialId, step: number | string): Promise<void> => {
      this._db.update(`gitorial:${id}:step`, step);
    },
    clear: async (id: T.TutorialId): Promise<void> => {
      await this._db.update(`gitorial:${id}:step`, undefined);
    }
  };
}

export { GlobalState, IDB };
