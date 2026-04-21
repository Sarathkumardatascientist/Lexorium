const { getJsonBody, sendJson } = require('../_lib/http');
const fs = require('fs');
const path = require('path');

const INSIGHTS_FILE = path.join(__dirname, '..', '..', 'insights-data.json');

const defaultInsights = [
  {id:1,title:"What is an FIR?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"First Information Report is the initial document that registers a crime with the police.",whyItMatters:"Filing an FIR sets the criminal justice process in motion. Without it, most criminal cases cannot proceed.",coreRule:"Under CrPC Section 154, any person can report a cognizable offense to the police, who must register it and investigate.",example:"If you witness a theft, you file an FIR at the police station, leading to investigation.",takeaway:"An FIR is the first step. Delay or refusal can be challenged in court.",featured:true},
  {id:2,title:"What is Anticipatory Bail?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Advance bail granted before arrest to protect against imminent custody.",whyItMatters:"Allows individuals to avoid pre-trial detention when they fear false accusations.",coreRule:"Section 438 of CrPC enables courts to grant anticipatory bail.",example:"A businessperson anticipating false fraud charges can seek anticipatory bail.",takeaway:"Protects against harassment while ensuring cooperation.",featured:false},
  {id:3,title:"What is Arbitration?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Private dispute resolution by a neutral third party instead of court.",whyItMatters:"Faster, confidential, and cheaper than traditional litigation.",coreRule:"Arbitration and Conciliation Act, 1996 enforces arbitration awards.",example:"Contract dispute resolved by an arbitrator whose decision is binding.",takeaway:"Include arbitration clauses in contracts.",featured:false},
  {id:4,title:"What is Money Laundering?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Processing illegal money to appear legitimate through hidden transactions.",whyItMatters:"A serious crime that finances terrorism and organized crime.",coreRule:"Prevention of Money Laundering Act, 2002 criminalizes proceeds of crime.",example:"Breaking large cash deposits into smaller amounts to avoid reporting.",takeaway:"Compliance and KYC are essential defenses.",featured:false},
  {id:5,title:"What is Consideration in Contracts?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Something of value exchanged between parties to form a valid contract.",whyItMatters:"Without consideration, a contract is generally unenforceable.",coreRule:"Indian Contract Act, Section 2(d) defines consideration.",example:"You pay ₹500 for a book - payment is consideration.",takeaway:"Always ensure consideration is clearly stated.",featured:false},
  {id:6,title:"What is Significant Influence?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Power to affect company decisions without formal control.",whyItMatters:"Determines corporate group relationships.",coreRule:"AS 21 defines significant influence as 20%+ voting power.",example:"25% shareholder influencing board decisions.",takeaway:"Key for understanding group structures.",featured:false},
  {id:7,title:"What is Oppression and Mismanagement?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Minority shareholder protection against majority abuse.",whyItMatters:"Provides legal remedy when shareholders treated unfairly.",coreRule:"Section 397-398 of Companies Act allows NCLT petition.",example:"Minority shareholders ousted from management can petition NCLT.",takeaway:"Document oppression with evidence.",featured:false},
  {id:8,title:"What is Insider Trading?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Trading securities using unpublished price-sensitive information.",whyItMatters:"Serious offense that undermines market integrity.",coreRule:"SEBI Insider Trading Regulations, 2015 prohibit UPSI trading.",example:"CEO selling shares before announcing poor earnings.",takeaway:"Maintain compliance programs.",featured:false},
  {id:9,title:"What is a Writ Petition?",category:"Constitutional Law",readTime:"1 min",oneLineMeaning:"Direct constitutional remedy against state action violating rights.",whyItMatters:"Fastest way to challenge government violations.",coreRule:"Article 32 (Supreme Court) and Article 226 (High Court).",example:"Filing habeas corpus if wrongly detained.",takeaway:"Writs are extraordinary remedies.",featured:false},
  {id:10,title:"What is Corporate Veil?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Legal separation between a company and its owners.",whyItMatters:"Protects shareholders from personal liability.",coreRule:"Courts can pierce veil under fraud or evasion.",example:"Using company to evade personal debts.",takeaway:"Maintain corporate formalities.",featured:false},
  {id:11,title:"What is Specific Performance?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Court order enforcing contract execution.",whyItMatters:"Unique goods cannot be substituted with damages.",coreRule:"Specific Relief Act enables specific performance.",example:"Court ordering sale of heritage property.",takeaway:"Discretionary - adequate remedies preferred.",featured:false},
  {id:12,title:"What is Defamation?",category:"Constitutional Law",readTime:"1 min",oneLineMeaning:"False statement harming another's reputation.",whyItMatters:"Protects personal and professional reputation.",coreRule:"IPC Sections 499-500 criminalize defamation.",example:"Publishing false corruption allegations.",takeaway:"Truth is a defense.",featured:false},
  {id:13,title:"What is Mens Rea?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Guilty mind - criminal intent or knowledge of wrongdoing.",whyItMatters:"Essential element for criminal liability.",coreRule:"Requires actus reus AND mens rea.",example:"Accidental death vs. knowing murder.",takeaway:"Understand mens rea requirements.",featured:false},
  {id:14,title:"What is Res Judicata?",category:"Contract Law",readTime:"1 min",oneLineMeaning:"Same matter cannot be litigated twice.",whyItMatters:"Prevents endless litigation.",coreRule:"CPC Section 11 bars same cause action.",example:"Suing and losing bars same suit.",takeaway:"One judgment ends the matter.",featured:false},
  {id:15,title:"What is Cheque Bounce?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Dishonor of cheque due to insufficient funds.",whyItMatters:"Criminal offense under Section 138 of NI Act.",coreRule:"Cheque bounce is criminal within validity period.",example:"Cheque bounces due to stop payment.",takeaway:"Can lead to 2 years imprisonment.",featured:false},
  {id:16,title:"What is Copyright Infringement?",category:"IP Law",readTime:"1 min",oneLineMeaning:"Unauthorized use of protected creative works.",whyItMatters:"Protects creators' intellectual property.",coreRule:"Copyright Act, 1957 protects original works.",example:"Using song lyrics without permission.",takeaway:"Fair use exceptions exist.",featured:false},
  {id:17,title:"What is Limited Liability?",category:"Corporate Law",readTime:"1 min",oneLineMeaning:"Shareholder liability limited to unpaid capital.",whyItMatters:"Protects personal assets from business debts.",coreRule:"LL companies shield owners from personal liability.",example:"Company debts are not personal debts.",takeaway:"Maintain corporate formalities.",featured:false},
  {id:18,title:"What is a Show Cause Notice?",category:"Criminal Law",readTime:"1 min",oneLineMeaning:"Formal notice requiring explanation before action.",whyItMatters:"Procedural requirement before penalties.",coreRule:"Natural justice requires opportunity to explain.",example:"Tax department issuing show cause.",takeaway:"Always respond within deadline.",featured:false}
];

function readInsights() {
  try {
    if (fs.existsSync(INSIGHTS_FILE)) {
      const data = fs.readFileSync(INSIGHTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return defaultInsights;
}

module.exports = async function (req, res) {
  if (req.method === 'GET') {
    const insights = readInsights();
    return sendJson(res, 200, { insights });
  }
  
  if (req.method === 'POST') {
    const body = await getJsonBody(req);
    const insights = body.insights || [];
    
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'Sarathkumardatascientist';
    const REPO_NAME = process.env.GITHUB_REPO_NAME || 'Lexorium';
    
    if (GITHUB_TOKEN) {
      try {
        const filePath = 'insights-data.json';
        const content = JSON.stringify(insights, null, 2);
        const encodedContent = Buffer.from(content).toString('base64');
        
        let sha = null;
        const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
        const getResponse = await fetch(getUrl, {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Lexorium-Bot'
          }
        });
        
        if (getResponse.ok) {
          const getData = await getResponse.json();
          sha = getData.sha;
        }
        
        const putData = {
          message: 'Update legal insights - ' + new Date().toISOString(),
          content: encodedContent,
        };
        if (sha) putData.sha = sha;
        
        const putResponse = await fetch(getUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Lexorium-Bot'
          },
          body: JSON.stringify(putData)
        });
        
        if (putResponse.ok) {
          return sendJson(res, 200, { success: true, count: insights.length, deployed: true });
        }
      } catch (githubErr) {
        console.error('GitHub push failed:', githubErr.message);
      }
    }
    
    return sendJson(res, 200, { success: true, count: insights.length, deployed: false });
  }
  
  return sendJson(res, 405, { error: 'Method not allowed' });
};