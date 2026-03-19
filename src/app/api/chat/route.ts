import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { message } = await req.json();

        // Mock AI delay to simulate processing
        await new Promise((resolve) => setTimeout(resolve, 1200));

        // A simple mocked response logic
        const lowerMessage = message.toLowerCase();
        let reply = "I have noted your request. A member of our team will attend to it immediately.";

        if (lowerMessage.includes("pillow") || lowerMessage.includes("bed")) {
            reply = "I will arrange for your preferred pillow selection to be sent to your suite immediately. Is there a specific type of down or memory foam you prefer?";
        } else if (lowerMessage.includes("dining") || lowerMessage.includes("food") || lowerMessage.includes("dinner")) {
            reply = "I can arrange a private dining experience in your suite or secure a reservation at our rooftop restaurant. What is your preference?";
        } else if (lowerMessage.includes("helicopter") || lowerMessage.includes("transport")) {
            reply = "Our private helicopter charter is on standby at the helipad. Please let me know your destination and preferred departure time.";
        } else if (lowerMessage.includes("spa") || lowerMessage.includes("massage")) {
            reply = "Our wellness sanctuary awaits. I recommend our signature 90-minute Zenith Renewal treatment. Shall I book an appointment for you?";
        }

        return NextResponse.json({ reply });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
