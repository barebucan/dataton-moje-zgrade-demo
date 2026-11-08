"""Evidence hashes for the observed HAZU pages; ignore only their changing newsletter timestamp."""
import re,hashlib
def hazu_content_hash(data):
 # This exact hidden field is outside the building timeline; all other bytes remain part of the hash.
 return hashlib.sha256(re.sub(rb'(name="_mc4wp_timestamp" value=")[0-9]+(")',rb'\1<TIMESTAMP>\2',data)).hexdigest()

def verify_table_work_reference(directory, proof):
 from html.parser import HTMLParser
 payload=(directory/proof['file']).read_bytes()
 assert hashlib.sha256(payload).hexdigest()==proof['sha256']
 class TableReferences(HTMLParser):
  def __init__(self):
   super().__init__();self.heading='';self.head=None;self.cell=None;self.cells=[];self.rows=[]
  def handle_starttag(self,tag,attrs):
   if tag in ('h1','h2','h3','h4','h5','h6'):self.head=[]
   if tag=='tr':self.cells=[]
   if tag in ('td','th'):self.cell=[]
  def handle_data(self,data):
   if self.head is not None:self.head.append(data)
   if self.cell is not None:self.cell.append(data)
  def handle_endtag(self,tag):
   if tag in ('h1','h2','h3','h4','h5','h6') and self.head is not None:
    self.heading=' '.join(' '.join(self.head).split());self.head=None
   if tag in ('td','th') and self.cell is not None:
    self.cells.append(' '.join(' '.join(self.cell).split()));self.cell=None
   if tag=='tr' and len(self.cells)==2 and self.cells[0]!='Naručitelj':
    self.rows.append((self.heading,list(self.cells)))
 parser=TableReferences();parser.feed(payload.decode('utf-8'))
 assert 0<proof['row']<=len(parser.rows)
 heading,cells=parser.rows[proof['row']-1]
 assert str(proof['year']) in heading and cells==[proof['client'],proof['work']]
 return proof

def verify_pdf_address_reference(directory, proof, address):
 payload=(directory/proof['file']).read_bytes()
 assert hashlib.sha256(payload).hexdigest()==proof['sha256']
 assert isinstance(proof['page'],int) and proof['page']>=1
 assert proof['canonical_address']==address and proof['required_text']
 engine=proof.get('text_engine','pypdf')
 if engine=='pypdf':
  from pypdf import PdfReader
  text=PdfReader(directory/proof['file']).pages[proof['page']-1].extract_text()
 elif engine=='pdfium':
  import pypdfium2
  with pypdfium2.PdfDocument(str(directory/proof['file'])) as document:
   assert 1<=proof['page']<=len(document)
   text=document[proof['page']-1].get_textpage().get_text_range()
 else:raise AssertionError('Unsupported PDF text engine')
 normalization=proof.get('normalization','whitespace')
 if normalization=='whitespace':text=' '.join(text.split())
 elif normalization=='compact':
  assert engine=='pdfium'
  text=''.join(text.split())
 else:raise AssertionError('Unsupported PDF normalization')
 assert all(phrase in text for phrase in proof['required_text'])
 return proof
