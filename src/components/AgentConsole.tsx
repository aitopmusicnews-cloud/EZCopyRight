import { useState } from 'react';
import {
  ArrowLeft,
  Bot,
  CircleDollarSign,
  CloudCog,
  Loader2,
  SearchCode,
  Send,
  ServerCog,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { askAgent } from '../lib/agent';

interface Props {
  userEmail: string | null;
  onBack: () => void;
  onSignOut: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

const quickActions = [
  {
    label: 'Check Health',
    icon: ServerCog,
    prompt: 'Check the current EZCopyRight deployment health and tell me if everything looks healthy.',
  },
  {
    label: 'Check Errors',
    icon: SearchCode,
    prompt: 'Check the EZCopyRight application logs for errors in the last 2 hours and explain anything important.',
  },
  {
    label: 'AWS Costs',
    icon: CircleDollarSign,
    prompt: 'Show me the AWS cost summary for the last 7 days and explain the biggest costs in plain language.',
  },
  {
    label: 'Idle Resources',
    icon: CloudCog,
    prompt: 'Check for obvious idle AWS resources that may be wasting money. Do not change or delete anything.',
  },
];

function makeId() {
  return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

export default function AgentConsole({ userEmail, onBack, onSignOut }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      text: 'I can check EZCopyRight health, logs, AWS costs, and idle resources. I can also prepare a production deployment, but I cannot start it until you explicitly approve it.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDeploymentMessage, setPendingDeploymentMessage] = useState<string | null>(null);
  const [error, setError] = useState('');

  const submit = async (message: string, confirmDeployment = false) => {
    const clean = message.trim();
    if (!clean || busy) return;

    setBusy(true);
    setError('');

    if (!confirmDeployment) {
      setMessages((current) => [...current, { id: makeId(), role: 'user', text: clean }]);
    }

    try {
      const result = await askAgent(clean, confirmDeployment);
      if (result.reply) {
        setMessages((current) => [...current, { id: makeId(), role: 'agent', text: result.reply }]);
      }
      if (result.requiresConfirmation && result.pendingAction?.name === 'startDeployment') {
        setPendingDeploymentMessage(clean);
      } else {
        setPendingDeploymentMessage(null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The AWS Agent request failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendCurrent = () => {
    const message = input;
    setInput('');
    void submit(message);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-stone-950 to-neutral-950 text-white">
      <div className="border-b border-white/10 bg-neutral-950/85 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer" aria-label="Back to dashboard">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
              <Bot className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white truncate">EZCopyRight AWS Agent</p>
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin-only · deployment protected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userEmail && <span className="hidden md:block text-sm text-white/40">{userEmail}</span>}
            <button onClick={onSignOut} className="text-sm text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition cursor-pointer">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-7">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            AWS Control Center
          </h1>
          <p className="text-white/50 max-w-3xl">
            Ask in normal language. Read-only checks run automatically. Production deployment always stops for your approval first.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {quickActions.map(({ label, icon: Icon, prompt }) => (
            <button
              key={label}
              onClick={() => void submit(prompt)}
              disabled={busy}
              className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] disabled:opacity-50 p-4 text-left transition cursor-pointer"
            >
              <Icon className="w-5 h-5 text-orange-400 mb-3" />
              <span className="text-sm font-semibold">{label}</span>
            </button>
          ))}
        </div>

        <section className="rounded-3xl border border-white/10 bg-black/25 overflow-hidden shadow-2xl">
          <div className="h-[48vh] min-h-[360px] overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={'flex ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={
                    message.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-orange-600 px-4 py-3 text-sm text-white'
                      : 'max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 whitespace-pre-wrap'
                  }
                >
                  {message.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-white/45">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking AWS...
              </div>
            )}
          </div>

          {pendingDeploymentMessage && (
            <div className="mx-4 sm:mx-6 mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <TriangleAlert className="w-5 h-5 text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-100">Production deployment requires your approval</p>
                  <p className="text-sm text-white/55 mt-1">Nothing has been deployed yet.</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      disabled={busy}
                      onClick={() => void submit(pendingDeploymentMessage, true)}
                      className="rounded-xl bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 text-sm font-bold disabled:opacity-50 cursor-pointer"
                    >
                      Approve & Start Deployment
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setPendingDeploymentMessage(null)}
                      className="rounded-xl bg-white/10 hover:bg-white/15 text-white/70 px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mx-4 sm:mx-6 mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100 flex items-start gap-3">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-200/60 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="border-t border-white/10 p-4 sm:p-5 bg-neutral-950/60">
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendCurrent();
                  }
                }}
                rows={2}
                placeholder="Ask: Is EZCopyRight healthy? Check Stripe errors. What is costing money?"
                className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
              <button
                onClick={sendCurrent}
                disabled={busy || !input.trim()}
                className="w-12 h-12 rounded-2xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 flex items-center justify-center transition cursor-pointer"
                aria-label="Send message"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
