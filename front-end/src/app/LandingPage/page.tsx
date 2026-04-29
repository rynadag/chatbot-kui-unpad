'use client';
import Chatbot from '../chatbot/chatbot';

export default function Home() {

  return (
    <main className="max-w-screen flex items-center justify-center bg-background text-foreground p-2">
      <div className="w-full max-w-8xl"> 
        <Chatbot />
      </div>
    </main>
  );
}
