"""Train a Vietnamese toxicity classifier with detailed metrics.

Expected CSV format: two columns `text` and `label` where `label` is 1 for toxic, 0 for clean.

Usage:
  python train.py --data path/to/dataset.csv --out-dir ./model
"""
import argparse
import os
import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_recall_fscore_support
import numpy as np


def load_data(path):
    # support a single file or a directory of files
    paths = []
    if os.path.isdir(path):
        for fname in os.listdir(path):
            if fname.lower().endswith(('.csv', '.tsv', '.txt')):
                paths.append(os.path.join(path, fname))
    else:
        paths = [path]

    if not paths:
        raise ValueError(f'No data files found at {path}')

    dfs = []
    for p in paths:
        sep = ','
        if p.lower().endswith('.tsv'):
            sep = '\t'
        try:
            df = pd.read_csv(p, sep=sep, engine='python')
        except Exception as e:
            raise ValueError(f'Failed to read {p}: {e}')

        # allow datasets that use 'content' column and/or have 'index_spans' instead of explicit labels
        if 'text' not in df.columns and 'content' in df.columns:
            df = df.rename(columns={'content': 'text'})

        if 'label' not in df.columns:
            if 'index_spans' in df.columns:
                # treat non-empty index_spans as toxic
                def spans_to_label(s):
                    try:
                        if isinstance(s, str):
                            s2 = s.strip()
                            if s2 == '' or s2 == '[]':
                                return 0
                            # non-empty list string
                            return 1
                        if s is None:
                            return 0
                        return 1 if len(s) else 0
                    except Exception:
                        return 0

                df['label'] = df['index_spans'].apply(spans_to_label)
            else:
                raise ValueError(f'File {p} must contain `text` (or `content`) and `label` columns, or `index_spans` to infer labels')
        df = df.dropna(subset=['text'])
        dfs.append(df[['text', 'label']])

    all_df = pd.concat(dfs, ignore_index=True)
    return all_df['text'].astype(str).tolist(), all_df['label'].astype(int).tolist()


def print_section(title):
    """Print a formatted section header."""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)


def train(texts, labels, out_dir):
    # Dataset statistics
    print_section("DATASET STATISTICS")
    total = len(labels)
    toxic_count = sum(labels)
    clean_count = total - toxic_count
    print(f"Total samples: {total:,}")
    print(f"Toxic samples: {toxic_count:,} ({toxic_count/total*100:.2f}%)")
    print(f"Clean samples: {clean_count:,} ({clean_count/total*100:.2f}%)")
    print(f"Class ratio (toxic:clean): 1:{clean_count/toxic_count:.2f}" if toxic_count > 0 else "No toxic samples!")
    
    # Average text length
    avg_len = np.mean([len(t.split()) for t in texts])
    print(f"Average text length: {avg_len:.1f} words")

    # Vectorization
    print_section("VECTORIZATION")
    vec = TfidfVectorizer(ngram_range=(1,2), max_features=50000)
    X = vec.fit_transform(texts)
    print(f"TF-IDF Parameters:")
    print(f"  - N-gram range: (1, 2)")
    print(f"  - Max features: 50,000")
    print(f"  - Vocabulary size: {len(vec.vocabulary_):,}")
    print(f"  - Feature matrix shape: {X.shape}")

    # Train-test split
    print_section("TRAIN-TEST SPLIT")
    X_train, X_test, y_train, y_test = train_test_split(
        X, labels, test_size=0.1, random_state=42, stratify=labels
    )
    print(f"Training set: {len(y_train):,} samples ({len(y_train)/total*100:.1f}%)")
    print(f"Test set: {len(y_test):,} samples ({len(y_test)/total*100:.1f}%)")
    print(f"Train toxic ratio: {sum(y_train)/len(y_train)*100:.2f}%")
    print(f"Test toxic ratio: {sum(y_test)/len(y_test)*100:.2f}%")

    # Model training
    print_section("MODEL TRAINING")
    clf = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42)
    print(f"Model: Logistic Regression")
    print(f"Parameters:")
    print(f"  - Max iterations: 1000")
    print(f"  - Class weight: balanced")
    print(f"  - Solver: lbfgs (default)")
    print(f"  - Regularization (C): 1.0 (default)")
    
    print("\nTraining model...")
    clf.fit(X_train, y_train)
    print(f"✓ Training completed!")
    print(f"  - Converged: {clf.n_iter_[0] < 1000}")
    print(f"  - Iterations used: {clf.n_iter_[0]}")

    # Evaluation
    print_section("MODEL EVALUATION")
    
    # Training accuracy
    train_preds = clf.predict(X_train)
    train_acc = accuracy_score(y_train, train_preds)
    print(f"Training Accuracy: {train_acc*100:.2f}%")
    
    # Test accuracy
    test_preds = clf.predict(X_test)
    test_acc = accuracy_score(y_test, test_preds)
    print(f"Test Accuracy: {test_acc*100:.2f}%")
    
    # Confusion matrix
    print("\nConfusion Matrix (Test Set):")
    cm = confusion_matrix(y_test, test_preds)
    print(f"                Predicted")
    print(f"              Clean  Toxic")
    print(f"Actual Clean  {cm[0][0]:5d}  {cm[0][1]:5d}")
    print(f"       Toxic  {cm[1][0]:5d}  {cm[1][1]:5d}")
    
    # Detailed metrics
    print("\nDetailed Classification Report:")
    print(classification_report(y_test, test_preds, target_names=['Clean', 'Toxic']))
    
    # Additional metrics
    precision, recall, f1, support = precision_recall_fscore_support(y_test, test_preds, average='binary')
    print(f"\nAggregate Metrics (Toxic class):")
    print(f"  - Precision: {precision:.4f}")
    print(f"  - Recall: {recall:.4f}")
    print(f"  - F1-Score: {f1:.4f}")
    
    # Feature importance (top toxic and clean words)
    print_section("TOP FEATURES")
    feature_names = vec.get_feature_names_out()
    coef = clf.coef_[0]
    
    # Top toxic features
    top_toxic_idx = np.argsort(coef)[-10:][::-1]
    print("\nTop 10 Toxic Indicators:")
    for i, idx in enumerate(top_toxic_idx, 1):
        print(f"  {i:2d}. '{feature_names[idx]}' (weight: {coef[idx]:.4f})")
    
    # Top clean features
    top_clean_idx = np.argsort(coef)[:10]
    print("\nTop 10 Clean Indicators:")
    for i, idx in enumerate(top_clean_idx, 1):
        print(f"  {i:2d}. '{feature_names[idx]}' (weight: {coef[idx]:.4f})")

    # Save model
    print_section("SAVING MODEL")
    os.makedirs(out_dir, exist_ok=True)
    vec_path = os.path.join(out_dir, 'vectorizer.joblib')
    model_path = os.path.join(out_dir, 'model.joblib')
    
    joblib.dump(vec, vec_path)
    joblib.dump(clf, model_path)
    
    print(f"✓ Vectorizer saved to: {vec_path}")
    print(f"✓ Model saved to: {model_path}")
    print(f"\nModel is ready for inference!")
    print("="*70 + "\n")


def main():
    p = argparse.ArgumentParser()
    default_data = os.path.join(os.path.dirname(__file__), 'data')
    p.add_argument('--data', default=default_data,
                   help=f"Path to CSV file or directory (default: {default_data})")
    p.add_argument('--out-dir', default=os.path.join(os.path.dirname(__file__), 'model'))
    args = p.parse_args()

    print("\n" + "="*70)
    print("  VIETNAMESE TOXICITY CLASSIFIER TRAINING")
    print("="*70)
    print(f'\nLoading data from: {args.data}')
    
    texts, labels = load_data(args.data)
    train(texts, labels, args.out_dir)


if __name__ == '__main__':
    main()