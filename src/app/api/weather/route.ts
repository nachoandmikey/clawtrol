import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Using wttr.in for simple weather data (no API key needed)
    const res = await fetch('https://wttr.in/Barcelona?format=j1', {
      headers: { 'User-Agent': 'curl' },
    });
    const data = await res.json();
    
    const current = data.current_condition?.[0];
    const today = data.weather?.[0];
    
    return NextResponse.json({
      location: 'Barcelona',
      current: {
        temp: current?.temp_C,
        feelsLike: current?.FeelsLikeC,
        humidity: current?.humidity,
        description: current?.weatherDesc?.[0]?.value,
        windSpeed: current?.windspeedKmph,
        uvIndex: current?.uvIndex,
      },
      today: {
        maxTemp: today?.maxtempC,
        minTemp: today?.mintempC,
        sunrise: today?.astronomy?.[0]?.sunrise,
        sunset: today?.astronomy?.[0]?.sunset,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Weather error:', error);
    return NextResponse.json({ error: 'Failed to get weather' }, { status: 500 });
  }
}
