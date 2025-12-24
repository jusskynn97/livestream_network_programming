"""FastAPI ML prediction server.

Start with:
  pip install -r requirements.txt
  python server.py --model-dir ./model --host 127.0.0.1 --port 5000
"""
import argparse
import os
import joblib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


class Request(BaseModel):
    text: str


def create_app(model_dir):
    vec = joblib.load(os.path.join(model_dir, 'vectorizer.joblib'))
    clf = joblib.load(os.path.join(model_dir, 'model.joblib'))

    app = FastAPI()

    # Add CORS middleware to allow cross-origin requests
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins
        allow_credentials=True,
        allow_methods=["*"],  # Allow all methods
        allow_headers=["*"],  # Allow all headers
    )

    @app.post('/predict')
    def predict(req: Request):
        text = req.text or ''
        X = vec.transform([text])
        prob = clf.predict_proba(X)[0]
        # assume classes [0,1] where 1 == toxic
        toxic_score = float(prob[1]) if len(prob) > 1 else 0.0
        toxic = toxic_score >= 0.5
        return { 'toxic': bool(toxic), 'score': toxic_score }

    return app


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model-dir', default='./model')
    p.add_argument('--host', default='127.0.0.1')
    p.add_argument('--port', type=int, default=5000)
    args = p.parse_args()

    if not os.path.exists(os.path.join(args.model_dir, 'model.joblib')):
        raise SystemExit('model.joblib not found in model dir; run train.py first')

    app = create_app(args.model_dir)
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == '__main__':
    main()
