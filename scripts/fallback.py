"""Adaptador local de contingência. NÃO é Moto/ElasticMQ nem valida AWS.
Subconjunto HTTP usado por este MVP; sqlite só persiste objetos e mensagens,
enquanto os dados de negócio continuam exclusivamente no PostgreSQL/Prisma.
"""
import argparse, datetime, hashlib, hmac, json, sqlite3, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, parse_qsl, quote
from xml.sax.saxutils import escape

parser = argparse.ArgumentParser()
parser.add_argument('--s3-port', type=int, default=5000)
parser.add_argument('--sqs-port', type=int, default=9324)
parser.add_argument('--data', default='.local/fallback')
args = parser.parse_args()
if (args.s3_port,args.sqs_port) not in [(5000,9324),(15000,19324)]:
    raise SystemExit('Portas locais não autorizadas')
root = Path(args.data).resolve()
allowed = Path('.local').resolve()
if allowed not in root.parents:
    raise SystemExit('Diretório deve ficar dentro de .local deste projeto')
root.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(root/'emulation.sqlite', check_same_thread=False)
db.executescript('''CREATE TABLE IF NOT EXISTS buckets(name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS objects(bucket TEXT,key TEXT,body BLOB,mime TEXT,PRIMARY KEY(bucket,key));
CREATE TABLE IF NOT EXISTS queues(name TEXT PRIMARY KEY,attrs TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,queue TEXT,body TEXT,receipt TEXT,visible REAL,count INT DEFAULT 0);
''')
lock = threading.RLock()

class Handler(BaseHTTPRequestHandler):
    server_version = 'AgroCreditFallback/1.0'
    def log_message(self,*_): pass  # não registra URLs pré-assinadas
    def reply(self,status=200,body=b'',mime='application/xml',headers=None):
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        origin=self.headers.get('Origin','')
        if origin in ['http://127.0.0.1:5173','http://127.0.0.1:15173']:
            self.send_header('Access-Control-Allow-Origin',origin)
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.end_headers()
        if self.command!='HEAD': self.wfile.write(body)
    def data(self): return self.rfile.read(int(self.headers.get('Content-Length','0')))
    def signed_get(self):
        u=urlsplit(self.path); params=dict(parse_qsl(u.query)); signature=params.pop('X-Amz-Signature','')
        try:
            stamp=params['X-Amz-Date']; expires=int(params['X-Amz-Expires'])
            now=datetime.datetime.now(datetime.timezone.utc).timestamp()
            signed_at=datetime.datetime.strptime(stamp,'%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()
            credential=params['X-Amz-Credential']; access,scope=credential.split('/',1)
            if access!='agrolab-local' or not 0<expires<=60 or not signed_at-5<=now<=signed_at+expires: return False
            if params['X-Amz-SignedHeaders']!='host': return False
            query='&'.join(quote(k,safe='-_.~')+'='+quote(v,safe='-_.~') for k,v in sorted(params.items()))
            canonical='GET\n'+u.path+'\n'+query+'\nhost:'+self.headers['Host']+'\n\nhost\nUNSIGNED-PAYLOAD'
            sign='AWS4-HMAC-SHA256\n'+stamp+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()
            key=('AWS4'+'agrolab-local-secret').encode()
            for part in scope.split('/'): key=hmac.new(key,part.encode(),hashlib.sha256).digest()
            expected=hmac.new(key,sign.encode(),hashlib.sha256).hexdigest()
            return hmac.compare_digest(signature,expected)
        except (KeyError,ValueError): return False
    def do_OPTIONS(self): self.reply(headers={'Access-Control-Allow-Methods':'GET,PUT,POST,HEAD','Access-Control-Allow-Headers':'*'})
    def do_HEAD(self): self.s3()
    def do_GET(self): self.s3()
    def do_PUT(self): self.s3()
    def do_DELETE(self): self.s3()
    def s3(self):
        if self.server.server_port!=args.s3_port: self.reply(405);return
        u=urlsplit(self.path); parts=u.path.lstrip('/').split('/',1);bucket=parts[0];key=(parts[1] or None) if len(parts)>1 else None
        auth=self.headers.get('Authorization','')
        if self.command=='GET':
            if not key or not self.signed_get():self.reply(403,b'<Error><Code>AccessDenied</Code></Error>');return
        elif 'Credential=agrolab-local/' not in auth:
            self.reply(403,b'<Error><Code>AccessDenied</Code></Error>');return
        with lock:
            exists=db.execute('SELECT 1 FROM buckets WHERE name=?',(bucket,)).fetchone()
            if self.command=='PUT' and key is None:
                self.data();db.execute('INSERT OR IGNORE INTO buckets VALUES (?)',(bucket,));db.commit();self.reply();return
            if not exists:self.reply(404,b'<Error><Code>NoSuchBucket</Code></Error>');return
            if self.command=='HEAD':self.reply();return
            if self.command=='PUT':
                data=self.data()
                db.execute('INSERT OR REPLACE INTO objects VALUES (?,?,?,?)',(bucket,key,data,self.headers.get('Content-Type','application/octet-stream')));db.commit()
                self.reply(headers={'ETag':'"'+hashlib.md5(data).hexdigest()+'"'});return
            if self.command=='DELETE':db.execute('DELETE FROM objects WHERE bucket=? AND key=?',(bucket,key));db.commit();self.reply(204);return
            row=db.execute('SELECT body,mime FROM objects WHERE bucket=? AND key=?',(bucket,key)).fetchone()
            if not row:self.reply(404,b'<Error><Code>NoSuchKey</Code></Error>');return
            self.reply(200,row[0],row[1],{'Content-Disposition':'attachment'})
    def do_POST(self):
        if self.server.server_port!=args.sqs_port:self.reply(405);return
        params={k:v[0] for k,v in parse_qs(self.data().decode()).items()};action=params.get('Action','');name=params.get('QueueName') or params.get('QueueUrl','').rstrip('/').split('/')[-1]
        result=''
        with lock:
            if action=='CreateQueue':
                db.execute('INSERT OR IGNORE INTO queues(name) VALUES (?)',(name,))
                result=f'<QueueUrl>http://127.0.0.1:{args.sqs_port}/000000000000/{escape(name)}</QueueUrl>'
            elif action=='SetQueueAttributes':
                attrs={}
                for i in range(1,10):
                    if f'Attribute.{i}.Name' in params:attrs[params[f'Attribute.{i}.Name']]=params[f'Attribute.{i}.Value']
                current=db.execute('SELECT attrs FROM queues WHERE name=?',(name,)).fetchone()
                if current:db.execute('UPDATE queues SET attrs=? WHERE name=?',(json.dumps({**json.loads(current[0]),**attrs}),name))
            elif action=='GetQueueAttributes':
                count=db.execute('SELECT count(*) FROM messages WHERE queue=?',(name,)).fetchone()[0]
                result=f'<Attribute><Name>QueueArn</Name><Value>arn:aws:sqs:us-east-1:000000000000:{escape(name)}</Value></Attribute><Attribute><Name>ApproximateNumberOfMessages</Name><Value>{count}</Value></Attribute>'
            elif action=='SendMessage':
                mid=str(uuid.uuid4());body=params.get('MessageBody','')
                db.execute('INSERT INTO messages(id,queue,body,visible) VALUES (?,?,?,?)',(mid,name,body,time.time()))
                result=f'<MessageId>{mid}</MessageId><MD5OfMessageBody>{hashlib.md5(body.encode()).hexdigest()}</MD5OfMessageBody>'
            elif action=='ReceiveMessage':
                row=db.execute('SELECT id,body,count FROM messages WHERE queue=? AND visible<=? ORDER BY rowid LIMIT 1',(name,time.time())).fetchone()
                if row:
                    attrs=json.loads(db.execute('SELECT attrs FROM queues WHERE name=?',(name,)).fetchone()[0]);policy=json.loads(attrs.get('RedrivePolicy','{}'))
                    if policy and row[2]>=int(policy['maxReceiveCount']):
                        dead=policy['deadLetterTargetArn'].split(':')[-1];db.execute('UPDATE messages SET queue=?,count=0,receipt=NULL WHERE id=?',(dead,row[0]))
                    else:
                        receipt=str(uuid.uuid4());db.execute('UPDATE messages SET receipt=?,visible=?,count=count+1 WHERE id=?',(receipt,time.time()+int(attrs.get('VisibilityTimeout','15')),row[0]))
                        result=f'<Message><MessageId>{row[0]}</MessageId><ReceiptHandle>{receipt}</ReceiptHandle><Body>{escape(row[1])}</Body><Attribute><Name>ApproximateReceiveCount</Name><Value>{row[2]+1}</Value></Attribute></Message>'
            elif action=='DeleteMessage':db.execute('DELETE FROM messages WHERE queue=? AND receipt=?',(name,params.get('ReceiptHandle')))
            elif action=='PurgeQueue':db.execute('DELETE FROM messages WHERE queue=?',(name,))
            elif action=='ChangeMessageVisibility':db.execute('UPDATE messages SET visible=? WHERE queue=? AND receipt=?',(time.time()+int(params.get('VisibilityTimeout','0')),name,params.get('ReceiptHandle')))
            else:self.reply(400,b'<ErrorResponse><Error>Unsupported local action</Error></ErrorResponse>');return
            db.commit()
        if action=='ReceiveMessage' and not result:time.sleep(.2)
        body=f'<{action}Response xmlns="http://queue.amazonaws.com/doc/2012-11-05/"><{action}Result>{result}</{action}Result><ResponseMetadata><RequestId>{uuid.uuid4()}</RequestId></ResponseMetadata></{action}Response>'.encode()
        self.reply(200,body)

servers=[ThreadingHTTPServer(('127.0.0.1',p),Handler) for p in [args.s3_port,args.sqs_port]]
for server in servers:threading.Thread(target=server.serve_forever,daemon=True).start()
print(json.dumps({'event':'fallback.started','warning':'Contingência; não é Moto ou ElasticMQ','ports':[args.s3_port,args.sqs_port]}),flush=True)
try:
    while True:time.sleep(1)
except KeyboardInterrupt:
    for server in servers:server.shutdown()
    db.close()
