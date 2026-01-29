const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let SQL;
let db;

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'database', 'schema.sqlite.sql');

const initDatabase = async () => {
  try {
    SQL = await initSqlJs();
    
    let dbData = null;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      dbData = new Uint8Array(buffer);
    }
    
    db = new SQL.Database(dbData);
    
    if (!dbData) {
      console.log('📦 Initializing database...');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.run(schema);
      saveDatabase();
      console.log('✅ Database schema initialized');
    } else {
      console.log('✅ Database loaded');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

const saveDatabase = () => {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('Error saving database:', error);
  }
};

const convertQuery = (text) => {
  let converted = text;
  const paramMatches = text.match(/\$(\d+)/g);
  
  if (paramMatches) {
    const uniqueParams = [...new Set(paramMatches)].sort((a, b) => {
      const numA = parseInt(a.substring(1));
      const numB = parseInt(b.substring(1));
      return numA - numB;
    });
    
    uniqueParams.forEach((param, index) => {
      converted = converted.replace(new RegExp('\\' + param, 'g'), '?');
    });
  }
  
  converted = converted.replace(/RETURNING \*/gi, '');
  converted = converted.replace(/RETURNING [a-z_,\s]+/gi, '');
  
  return converted;
};

const query = async (text, params = []) => {
  try {
    if (!db) {
      await initDatabase();
    }
    
    const originalText = text;
    const hasReturning = text.toUpperCase().includes('RETURNING');
    const returningMatch = hasReturning ? text.match(/RETURNING\s+([a-z_,\s*]+)/i) : null;
    const tableMatch = text.match(/INSERT INTO\s+(\w+)/i);
    
    const convertedQuery = convertQuery(text);
    const isSelect = convertedQuery.trim().toUpperCase().startsWith('SELECT');
    
    if (isSelect) {
      const stmt = db.prepare(convertedQuery);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows };
    } else {
      const stmt = db.prepare(convertedQuery);
      stmt.bind(params);
      stmt.step();
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0];
      stmt.free();
      
      if (hasReturning && lastInsertRowid && tableMatch) {
        const tableName = tableMatch[1];
        let selectFields = '*';
        
        if (returningMatch) {
          const fields = returningMatch[1].trim();
          if (fields !== '*') {
            selectFields = fields;
          }
        }
        
        const selectQuery = `SELECT ${selectFields} FROM ${tableName} WHERE id = ?`;
        const selectStmt = db.prepare(selectQuery);
        selectStmt.bind([lastInsertRowid.toString()]);
        let insertedRow = null;
        if (selectStmt.step()) {
          insertedRow = selectStmt.getAsObject();
        }
        selectStmt.free();
        
        saveDatabase();
        return { rows: insertedRow ? [insertedRow] : [], rowCount: 1, lastInsertRowid };
      }
      
      saveDatabase();
      return { rows: [], rowCount: 1, lastInsertRowid };
    }
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Original query:', text);
    console.error('Converted query:', convertQuery(text));
    throw error;
  }
};

const queryOne = async (text, params = []) => {
  try {
    if (!db) {
      await initDatabase();
    }
    
    const convertedQuery = convertQuery(text);
    const stmt = db.prepare(convertedQuery);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return { rows: row ? [row] : [] };
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const generateUUID = () => uuidv4();

module.exports = { 
  db: {
    query,
    queryOne,
    generateUUID
  },
  initDatabase
};
