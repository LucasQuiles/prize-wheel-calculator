# minimal Flask receiver for extension posts
from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route('/ingest', methods=['POST'])
def ingest():
    payload = request.get_json()
    print(payload.get('kind'), payload.get('url', '')[:80])
    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(port=5001)
