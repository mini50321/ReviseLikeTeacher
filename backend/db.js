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
      runMigrations();
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

const runMigrations = () => {
  try {
    const tableInfo = db.exec("PRAGMA table_info(question)");
    const columns = tableInfo[0]?.values.map(row => row[1]) || [];

    if (!columns.includes('options')) {
      db.run("ALTER TABLE question ADD COLUMN options TEXT");
      console.log('✅ Migration: Added options column to question table');
    }

    if (!columns.includes('correct_answer')) {
      db.run("ALTER TABLE question ADD COLUMN correct_answer TEXT");
      console.log('✅ Migration: Added correct_answer column to question table');
    }

    saveDatabase();
  } catch (error) {
    console.error('Migration error:', error);
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

const convertQuery = (text, params) => {
  let converted = text;
  const paramMatches = [];
  const paramPattern = /\$(\d+)/g;
  let match;
  
  while ((match = paramPattern.exec(text)) !== null) {
    paramMatches.push({
      index: match.index,
      paramNum: parseInt(match[1])
    });
  }
  
  converted = converted.replace(/RETURNING \*/gi, '');
  converted = converted.replace(/RETURNING [a-z_,\s]+/gi, '');
  
  if (paramMatches.length > 0) {
    const reorderedParams = [];
    paramMatches.sort((a, b) => a.index - b.index);
    
    paramMatches.forEach(m => {
      if (m.paramNum > 0 && m.paramNum <= params.length) {
        reorderedParams.push(params[m.paramNum - 1]);
      }
    });
    
    converted = converted.replace(/\$(\d+)/g, '?');
    
    return { query: converted, params: reorderedParams };
  }
  
  converted = converted.replace(/\$(\d+)/g, '?');
  
  return { query: converted, params };
};

const normalizeParams = (params) => {
  return params.map(param => param === undefined ? null : param);
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
    
    const converted = convertQuery(text, params);
    const convertedQuery = converted.query;
    const reorderedParams = converted.params;
    const isSelect = convertedQuery.trim().toUpperCase().startsWith('SELECT');
    
    if (isSelect) {
      const stmt = db.prepare(convertedQuery);
      stmt.bind(normalizeParams(reorderedParams));
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows };
    } else {
      const stmt = db.prepare(convertedQuery);
      stmt.bind(normalizeParams(reorderedParams));
      const stepResult = stmt.step();
      const changes = stmt.getRowsModified ? stmt.getRowsModified() : (db.getRowsModified ? db.getRowsModified() : 1);
      const lastInsertRowid = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0];
      stmt.free();
      
      console.log('Non-SELECT query executed:', {
        query: convertedQuery.substring(0, 100),
        stepResult,
        changes,
        lastInsertRowid
      });
      
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
        return { rows: insertedRow ? [insertedRow] : [], rowCount: changes || 1, lastInsertRowid };
      }
      
      saveDatabase();
      return { rows: [], rowCount: changes || 1, lastInsertRowid };
    }
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Original query:', text);
    const converted = convertQuery(text, params);
    console.error('Converted query:', converted.query);
    throw error;
  }
};

const queryOne = async (text, params = []) => {
  try {
    if (!db) {
      await initDatabase();
    }
    
    const converted = convertQuery(text, params);
    const convertedQuery = converted.query;
    const reorderedParams = converted.params;
    const stmt = db.prepare(convertedQuery);
    stmt.bind(normalizeParams(reorderedParams));
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
