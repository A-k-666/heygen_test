# main.py - FastAPI Backend for HeyGen LiveAvatar Streaming
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
BASE_URL = "https://api.heygen.com"
RAG_API_URL = "https://rag-super-agent.onrender.com/chat/"

app = FastAPI(title="HeyGen LiveAvatar Streaming API", version="1.0.0")

# CORS middleware - Change for production!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def heygen_get(endpoint: str):
    """Helper function for GET requests to HeyGen API"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.get(
            f"{BASE_URL}/{endpoint}",
            headers={"X-Api-Key": HEYGEN_API_KEY}
        )
        res.raise_for_status()
        return res.json()


async def heygen_post(endpoint: str, data: dict = None):
    """Helper function for POST requests to HeyGen API"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{BASE_URL}/{endpoint}",
            json=data,
            headers={
                "X-Api-Key": HEYGEN_API_KEY,
                "Content-Type": "application/json"
            }
        )
        res.raise_for_status()
        return res.json()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "HeyGen LiveAvatar Streaming Backend",
        "endpoints": {
            "streaming_token": "/streaming_token (POST)",
            "avatars": "/avatars (all avatars)",
            "interactive_avatars": "/interactive_avatars (streaming only)",
            "voices": "/voices",
            "chat": "/chat (POST)"
        },
        "limits": {
            "free_tier": {
                "resolution": "720p max",
                "session_duration": "3 minutes max",
                "credits_per_minute": "0.2 credits",
                "monthly_credits": "10 credits"
            }
        }
    }


@app.post("/streaming_token")
async def get_streaming_token():
    """
    Get streaming token for LiveAvatar SDK
    
    Free tier:
    - 0.2 credits per minute of streaming
    - Max 3 minutes per session
    - 720p resolution max
    """
    try:
        # Create streaming token - POST to v1/streaming.create_token
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                f"{BASE_URL}/v1/streaming.create_token",
                headers={
                    "X-Api-Key": HEYGEN_API_KEY,
                    "Content-Type": "application/json"
                }
            )
            
            if res.status_code != 200:
                error_text = res.text
                try:
                    error_json = res.json()
                    print(f"HeyGen API Error ({res.status_code}): {error_json}")
                except:
                    print(f"HeyGen API Error ({res.status_code}): {error_text}")
                return JSONResponse(
                    status_code=res.status_code,
                    content={"error": error_text, "status": res.status_code, "details": "Check backend logs"}
                )
            
            result = res.json()
            print(f"Token response structure: {list(result.keys())}")
            return result
    except httpx.TimeoutException as e:
        return JSONResponse(
            status_code=504,
            content={"error": f"Request timeout: {str(e)}"}
        )
    except httpx.HTTPStatusError as e:
        error_text = e.response.text if e.response else str(e)
        return JSONResponse(
            status_code=e.response.status_code if e.response else 500,
            content={"error": error_text, "status": e.response.status_code if e.response else 500}
        )
    except Exception as e:
        import traceback
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )


@app.get("/avatars")
async def get_avatars():
    """Get list of available avatars (all avatars - regular + interactive)"""
    try:
        result = await heygen_get("v2/avatars")
        return result
    except httpx.TimeoutException as e:
        return JSONResponse(
            status_code=504,
            content={"error": f"Request timeout: {str(e)}"}
        )
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            status_code=e.response.status_code,
            content={"error": e.response.text}
        )
    except Exception as e:
        import traceback
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )

@app.get("/interactive_avatars")
async def get_interactive_avatars():
    """
    Get list of Interactive Avatars ONLY (for streaming)
    
    Uses v1/streaming/avatar.list endpoint which returns ONLY Interactive Avatars
    This endpoint only returns avatars that work with streaming API
    """
    try:
        # Use the dedicated Interactive Avatar endpoint from HeyGen docs
        # GET /v1/streaming/avatar.list returns ONLY Interactive Avatars
        result = await heygen_get("v1/streaming/avatar.list")
        return result
    except httpx.TimeoutException as e:
        return JSONResponse(
            status_code=504,
            content={"error": f"Request timeout: {str(e)}"}
        )
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            status_code=e.response.status_code,
            content={"error": e.response.text}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.get("/voices")
async def get_voices():
    """Get list of available voices for streaming"""
    try:
        result = await heygen_get("v2/voices")
        return result
    except httpx.TimeoutException as e:
        return JSONResponse(
            status_code=504,
            content={"error": f"Request timeout: {str(e)}"}
        )
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            status_code=e.response.status_code,
            content={"error": e.response.text}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/chat")
async def chat(request: Request):
    """
    Chat endpoint that calls RAG Super Agent API
    
    Expected payload:
    {
        "message": "string",
        "conversation_id": "string" (optional)
    }
    """
    try:
        data = await request.json()
        message = data.get("message")
        
        if not message:
            return JSONResponse(
                status_code=400,
                content={"error": "Message is required"}
            )
        
        # Prepare payload for RAG API
        payload = {"message": message}
        if data.get("conversation_id"):
            payload["conversation_id"] = data["conversation_id"]
        
        # Call RAG Super Agent API
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                RAG_API_URL,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            res.raise_for_status()
            return res.json()
            
    except httpx.TimeoutException as e:
        return JSONResponse(
            status_code=504,
            content={"error": f"Request timeout: {str(e)}. RAG API is taking too long to respond."}
        )
    except httpx.HTTPStatusError as e:
        error_response = e.response.json() if e.response.text else {"error": e.response.text}
        return JSONResponse(
            status_code=e.response.status_code,
            content=error_response
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=3002, 
        reload=True,
        reload_excludes=["node_modules/**", "__pycache__/**"]
    )

