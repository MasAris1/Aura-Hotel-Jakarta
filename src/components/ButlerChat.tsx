"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";

interface Message {
    role: "user" | "butler";
    content: string;
}

export function ButlerChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "butler",
            content: "Good evening. I am The Royal Butler. How may I assist you with your stay at Aura?"
        }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMessage }]);
        setIsLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage }),
            });

            const data = await response.json();
            setMessages(prev => [...prev, { role: "butler", content: data.reply }]);
        } catch {
            setMessages(prev => [...prev, { role: "butler", content: "I apologize, but I am currently experiencing technical difficulties. Please contact the front desk directly." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:shadow-primary/30 z-50 group"
                >
                    <MessageSquare className="w-6 h-6" />
                </button>
            )}

            {isOpen && (
                <div
                    className="fixed bottom-6 right-6 w-[380px] h-[600px] max-h-[85vh] bg-background border border-border shadow-2xl z-50 flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="bg-card border-b border-border p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-serif text-lg text-foreground">The Royal Butler</h3>
                                <p className="text-[10px] font-sans tracking-widest uppercase text-foreground/50">AI Concierge</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-foreground/50 hover:text-foreground transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-100">
                        {messages.map((message, i) => (
                            <div
                                key={i}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] p-4 text-sm font-sans leading-relaxed ${message.role === "user"
                                        ? "bg-primary text-primary-foreground rounded-tl-2xl rounded-tr-sm rounded-b-2xl"
                                        : "bg-muted text-foreground border border-border rounded-tr-2xl rounded-tl-sm rounded-b-2xl font-light"
                                        }`}
                                >
                                    {message.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-muted border border-border rounded-tr-2xl rounded-tl-sm rounded-b-2xl p-4 flex gap-2">
                                    <span className="w-2 h-2 bg-foreground/50 rounded-full" />
                                    <span className="w-2 h-2 bg-foreground/50 rounded-full" />
                                    <span className="w-2 h-2 bg-foreground/50 rounded-full" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <form onSubmit={handleSubmit} className="p-4 bg-background border-t border-border">
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Request a service..."
                                className="w-full bg-transparent border border-input py-3 pl-4 pr-12 font-sans text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 p-2 text-foreground/50 hover:text-primary disabled:opacity-50 transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
